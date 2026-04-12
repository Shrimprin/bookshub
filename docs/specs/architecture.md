# BookHub アーキテクチャ定義書

## 1. システム構成

pnpm workspaces を用いたモノレポ構成。WebアプリとChrome拡張機能でTypeScript型定義・バリデーションスキーマを共有する。

```
hons/
├── apps/
│   ├── web/        # Next.js (App Router) — メインWebアプリ
│   └── extension/  # Chrome拡張機能 (Vite + CRXJS)
├── packages/
│   └── shared/     # 型定義・Zodスキーマの共有パッケージ
└── supabase/       # DBマイグレーション管理
```

---

## 2. データフロー

```
[ユーザー] → Supabase Auth でログイン
     ↓
[Chrome拡張機能] Kindle / DMMのページをスクレイピング
     ↓ 生データ解析（Parser）→ ScrapeBook[] に正規化
     ↓ POST (packages/shared の Zodスキーマでバリデーション)
[Next.js API] /api/scrape で重複チェック → Supabase PostgreSQL に保存
     ↓
[Next.js] データ取得 → shadcn/ui で本棚UIに描画
```

---

## 3. ディレクトリ構成

```
hons/
├── apps/
│   ├── web/
│   │   ├── app/
│   │   │   ├── (auth)/             # 未認証ページ（独自layout）
│   │   │   │   ├── login/
│   │   │   │   └── signup/
│   │   │   ├── (protected)/        # 認証済みページ（独自layout + ルート保護）
│   │   │   │   ├── bookshelf/      # 本棚メイン画面
│   │   │   │   ├── search/         # 書籍検索・登録
│   │   │   │   └── settings/       # ユーザー設定
│   │   │   ├── api/                # Route Handlers（各ファイルに export const runtime = 'edge'）
│   │   │   │   ├── books/          # 蔵書CRUD・書籍検索（楽天 / Google Books）
│   │   │   │   └── scrape/         # Chrome拡張機能からのデータ受信・重複検知
│   │   │   ├── layout.tsx
│   │   │   └── page.tsx
│   │   ├── components/
│   │   │   ├── ui/                 # shadcn/ui生成コンポーネント（汎用UIのみ）
│   │   │   └── layout/             # Header, Sidebar, Footer等（構造的UI）
│   │   ├── features/               # 機能単位のコンポーネント・ロジック
│   │   │   ├── bookshelf/          # 本棚表示・ギャラリー
│   │   │   ├── book-register/      # 書籍検索・登録
│   │   │   ├── duplicate-alert/    # 二度買い防止アラート（UIのみ）
│   │   │   └── next-volume/        # 次巻ステータス表示
│   │   ├── lib/
│   │   │   ├── supabase/
│   │   │   │   ├── client.ts       # ブラウザ用 (createBrowserClient)
│   │   │   │   ├── server.ts       # Server Component / Route Handler用 (createServerClient)
│   │   │   │   └── middleware.ts   # セッション更新用
│   │   │   └── book-search/         # 楽天ブックスAPI / Google Books API 書籍検索
│   │   ├── hooks/                  # カスタムReact Hooks
│   │   ├── middleware.ts           # ルート保護・セッションリフレッシュ
│   │   ├── next.config.ts
│   │   ├── tailwind.config.ts
│   │   └── .env.local              # gitignore対象
│   │
│   └── extension/
│       └── src/
│           ├── background/         # Service Worker
│           │   └── index.ts        # メッセージハンドリング、API通信、同期結果保存
│           ├── content/
│           │   ├── kindle.ts       # Kindle購入履歴スクレイパー + 正規化 + 送信
│           │   ├── dmm.ts          # DMM購入履歴スクレイパー + 正規化 + 送信
│           │   └── shared/
│           │       ├── parser.ts   # 生データ解析：巻数抽出、シリーズタイトル正規化
│           │       └── sender.ts   # Service Workerへのメッセージ送信
│           ├── popup/              # 拡張機能ポップアップUI
│           │   └── main.ts
│           ├── types/
│           │   └── messages.ts     # Content Script ↔ Service Worker メッセージ型
│           └── utils/
│               └── storage.ts      # chrome.storage ラッパー（トークン・同期結果）
│
├── packages/
│   └── shared/
│       └── src/
│           ├── types/
│           │   ├── book.ts         # Book, BookVolume, Store 等
│           │   └── user.ts         # UserProfile 等
│           ├── schemas/
│           │   └── book-schema.ts  # Zodスキーマ（Extension / Web API 両側で共有）
│           └── index.ts
│
├── supabase/
│   ├── migrations/
│   └── seed.sql
├── pnpm-workspace.yaml
├── .env.example                    # 環境変数テンプレート（git管理対象）
└── CLAUDE.md
```

---

## 4. Chrome 拡張機能の通信フロー

拡張機能は Manifest V3 の Service Worker ベースアーキテクチャを採用。Content Script ↔ Service Worker 間の通信は、型安全なメッセージを使用します。

### メッセージ型（src/types/messages.ts）

```typescript
// Content Script から Service Worker へ
type SendScrapedBooksMessage = {
  type: 'SEND_SCRAPED_BOOKS'
  books: ScrapeBook[]
}

type ReloadBookshelfMessage = {
  type: 'RELOAD_BOOKSHELF'
}

type ExtensionMessage = SendScrapedBooksMessage | ReloadBookshelfMessage

// Service Worker からのレスポンス（共通形式）
type MessageResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: ErrorCode }

type ErrorCode = 'VALIDATION_ERROR' | 'AUTH_ERROR' | 'API_ERROR' | 'NETWORK_ERROR' | 'UNKNOWN_ERROR'
```

### 通信フロー

1. **Content Script** (Kindle / DMM ページ)
   - DOM をスクレイピング → `ScrapeBook[]` に正規化
   - `chrome.runtime.sendMessage()` で Service Worker へ送信
   - Bearer トークンは Service Worker が保有（Content Script は知らない）

2. **Service Worker** (background/index.ts)
   - `chrome.runtime.onMessage` で受信
   - メッセージ型を型ガード `isValidMessage()` で検証
   - `sender.id === chrome.runtime.id` で送信元検証（セキュリティ）
   - Zod スキーマで payload をバリデーション
   - `/api/scrape` へ Bearer トークン付きで POST
   - 同期結果を `chrome.storage.local` に保存
   - 本棚タブを自動リロード
   - Response を Content Script へ返信

3. **API エンドポイント** (/api/scrape)
   - Bearer トークンで認証
   - バリデーションスキーマで payload 検証
   - 重複検知 → Supabase へ保存
   - 結果を JSON で返信

### Content Script から Service Worker への通信フロー

1. **Content Script** (src/content/kindle.ts / dmm.ts)
   - ページ読み込み後に `waitForElement()` で必要な DOM 要素を待機（タイムアウト: 10秒）
   - `scrapeBooks()` で DOM をスクレイピング → `RawBookData[]` を取得
   - `parseBooks()` で正規化：
     - 巻数抽出（複数のパターン対応: 「第1巻」「1巻」「(1)」「Vol.1」等）
     - シリーズタイトル正規化（巻数表記を除去）
     - URL バリデーション（https:// で始まるもののみ）
   - `sendScrapedBooks()` で Service Worker にメッセージを送信

2. **Service Worker** (src/background/index.ts)
   - Content Script からのメッセージを受信
   - Zod スキーマでバリデーション
   - `chrome.storage.local` から Supabase アクセストークンを取得 (Web アプリから受け渡し済み)
   - `/api/scrape` へ POST（Bearer トークン付き）

### Web アプリ → 拡張機能のトークン受け渡し

拡張機能は Supabase の cookie を直接読めないため、Web アプリ側の Client Component から Chrome 公式の `externally_connectable` 経由で `chrome.runtime.sendMessage` でトークンを送信する。

1. **Web アプリ側** (`apps/web/components/auth/extension-token-bridge.tsx`)
   - `(protected)/layout.tsx` に配置された Client Component
   - `useEffect` で Supabase の `getSession()` による初回同期と `onAuthStateChange` 購読
   - `SIGNED_IN` / `TOKEN_REFRESHED` / `INITIAL_SESSION` → `SET_ACCESS_TOKEN` を送信
   - `SIGNED_OUT` → `CLEAR_ACCESS_TOKEN` を送信
   - `chrome` 未定義 (Firefox/Safari/SSR) や拡張機能未インストール時は no-op

2. **Background Service Worker** (`handleExternalMessage`)
   - `chrome.runtime.onMessageExternal` で受信
   - `sender.origin` を `__ALLOWED_EXTERNAL_ORIGINS__` (vite define 経由で注入) で厳密一致検証
   - Zod `externalExtensionMessageSchema` でバリデーション (token の形式・長さ)
   - 許可されれば `chrome.storage.local` に保存 (拡張機能 reload を跨いで保持)

3. **外部メッセージ型** (`packages/shared/src/schemas/external-message-schema.ts`)
   - `SetAccessTokenMessage` / `ClearAccessTokenMessage`
   - 内部 `ExtensionMessage` とは独立した union 型で、ハンドラ混同を型レベルで防ぐ

### Extension ID 管理

開発環境では `@crxjs/vite-plugin` の `publicKey` オプションにより Extension ID を固定化する。

- **`CRX_PUBLIC_KEY`**: Chrome 拡張機能の公開鍵 (base64)。dev ビルド時のみ `vite.config.ts` で `crx({ publicKey })` に渡される。これにより Extension ID が決定論的に算出され、開発者間で共通の ID を使える
- **`NEXT_PUBLIC_EXTENSION_ID`**: Web アプリが `sendTokenToExtension` で使用する送信先 ID。`chrome://extensions` で確認した ID を設定
- 公開鍵・Extension ID はいずれも**公開情報**であり秘密ではない。`externally_connectable.matches` がセキュリティ境界となる
- 本番ビルドでは `publicKey` を埋め込まず、Chrome Web Store が発行する ID を使う

### Storage 設計

拡張機能の状態は `chrome.storage.local` に保存する。`chrome.storage.session` は拡張機能 reload で消去されるため、開発体験 (Hot Reload で頻繁にリロードする) と保護されたユーザー UX のため `local` を採用。

| キー                        | 内容                              | 保持期間                                      |
| --------------------------- | --------------------------------- | --------------------------------------------- |
| `bookhub_access_token`      | Supabase access token             | TOKEN_REFRESHED で上書き、SIGNED_OUT でクリア |
| `bookhub_last_sync_result`  | 直近のスクレイピング同期結果      | 次回同期で上書き                              |
| `bookhub_scrape_session_v1` | Kindle 累積スクレイピング進行状態 | 完了 / 5 分 TTL 超過 / リセットでクリア       |

**セキュリティ判断**: access token のみを保存 (refresh token は保存しない)。Supabase access token は 1 時間で失効するため、ディスク漏洩時の悪用期間が限定される。Supabase RLS により、仮にトークンが漏洩しても被害は当該ユーザーのデータに限定される。

### Kindle ページネーションの累積セッション

Amazon の Kindle 購入履歴ページ (`?pageNumber=N`) は完全なフルナビゲーションでページ遷移するため、Content Script のコンテキストが各ページ遷移で破棄される。複数ページの書籍を 1 回の API 呼び出しで送信するため、`chrome.storage.local` に進行状態を保存する累積方式を採用。

1. Content Script が読み込まれると `getScrapeSession()` で既存セッションを取得
2. セッションがない、または stale (5 分以上前) / `originalUrl` が異なる / 連続性が崩れている場合は新規作成
3. 現在ページの書籍をスクレイプして既存セッションにマージ (`mergeBooks` で重複排除)
4. 次ページ番号のリンク (`findPageLinkByNumber`) を探す
5. リンクがあれば `setScrapeSession` で保存 → `window.location.href` で `?pageNumber=N+1` に遷移
6. リンクがなければ最終ページとして累積を Background に送信 → `clearScrapeSession`
7. AUTH_ERROR / NETWORK_ERROR の場合はセッションを保持 (再ログイン後に再開可能)
8. セーフティ: `MAX_BOOKS_PER_REQUEST = 500` (`scrapePayloadSchema.books.max`) または `MAX_PAGES = 50` 到達で強制送信

純粋関数 (`extractPageNumber`, `buildPageUrl`, `mergeBooks` 等) は `apps/extension/src/content/shared/scrape-session.ts` に集約してテスト容易性を確保。

### エラーハンドリング

```typescript
// 各エラーケースは ErrorCode で分類
API 401 → AUTH_ERROR (再ログイン必要)
API 400 → VALIDATION_ERROR (バリデーション失敗)
API 500 → API_ERROR (サーバーエラー)
Network error → NETWORK_ERROR (接続失敗)
Invalid message → UNKNOWN_ERROR (不明なメッセージ)
Foreign sender → UNKNOWN_ERROR (送信元検証失敗)
```

---

## 6. 設計判断の根拠

| 判断                                       | 理由                                                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| pnpm workspaces モノレポ                   | `packages/shared` で型・スキーマ共有。Turborepoは現段階では過剰    |
| `(auth)` / `(protected)` ルートグループ    | 認証済み・未認証で layout と保護を分離                             |
| `lib/supabase/` を3ファイルに分割          | Cloudflare Edge Runtime + `@supabase/ssr` の推奨パターン           |
| `components/layout/` と `features/` を分離 | layoutは構造的関心事、featuresは機能的関心事                       |
| `duplicate-alert/` はUIのみ                | 重複検知ロジックは `api/scrape` サーバー側に置く                   |
| `extension/content/shared/`                | ストアをまたぐパース・API送信ロジックをDRY化                       |
| `packages/shared/schemas/` にZodスキーマ   | Extension→Web API間のデータ整合性を両側で保証                      |
| 型ガード `isValidMessage()`                | Content Script からの未検証 payload を Service Worker が安全に処理 |
| `sender.id === chrome.runtime.id`          | 悪意あるコンテンツスクリプトからのメッセージを拒否                 |

---

## 7. Cloudflare Pages Edge Runtime の制約

- Node.js固有API（`fs`、`Buffer`の一部等）は使用不可
- 各Route Handlerファイルに `export const runtime = 'edge'` が必要
- `supabase-js` はEdge互換のため問題なし
- 長時間処理（重いスクレイピング等）はサーバー側では行わない

---

## 8. 環境変数

`.env.example` をルートに配置し、チーム共有用テンプレートとする。実際の値は以下のように設定します。

### Web アプリ (apps/web/.env.local)

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 書籍情報API（どちらか一方）
RAKUTEN_APP_ID=
GOOGLE_BOOKS_API_KEY=

# Chrome 拡張機能連携（未設定時はトークン送信を no-op でスキップ）
NEXT_PUBLIC_EXTENSION_ID=
```

### Chrome 拡張機能 (ビルド時)

```bash
# 開発時 (Extension ID 固定化用の公開鍵を渡す)
CRX_PUBLIC_KEY=<base64> BOOKHUB_API_URL=http://localhost:3000 pnpm --filter extension dev

# 本番時（HTTPS 必須、publicKey は埋め込まない）
BOOKHUB_API_URL=https://bookshelf.example.com pnpm --filter extension build:prod
```

---

## 9. データベーススキーマ

詳細なテーブル定義、制約、RLS ポリシー、トリガーについては **[DB_SCHEMA.md](./DB_SCHEMA.md)** を参照してください。

### 概要

- **profiles**: Supabase Auth と 1:1 対応のユーザープロフィール
- **books**: 全ユーザー共有の書籍マスタ（1 レコード = 1 巻）
- **user_books**: ユーザーの所持情報（巻 × ストア単位）

各テーブルは Row Level Security で保護され、ユーザーは自分のデータのみアクセス可能です。
