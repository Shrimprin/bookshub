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
│           ├── content/
│           │   ├── kindle.ts       # Kindle購入履歴スクレイパー
│           │   ├── dmm.ts          # DMM購入履歴スクレイパー
│           │   └── shared/
│           │       ├── parser.ts   # 生データ → 共通Book型への正規化
│           │       └── sender.ts   # Web APIへのPOST処理
│           ├── popup/              # 拡張機能ポップアップUI
│           └── utils/
│               └── storage.ts      # chrome.storage ラッパー
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
   - 同期結果を `chrome.storage.session` に保存
   - 本棚タブを自動リロード
   - Response を Content Script へ返信

3. **API エンドポイント** (/api/scrape)
   - Bearer トークンで認証
   - バリデーションスキーマで payload 検証
   - 重複検知 → Supabase へ保存
   - 結果を JSON で返信

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
```

### Chrome 拡張機能 (ビルド時)

```bash
# 開発時
BOOKHUB_API_URL=http://localhost:3000 pnpm --filter extension dev

# 本番時（HTTPS 必須）
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
