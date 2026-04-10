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
│   │   │   │   ├── books/          # 蔵書CRUD
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
│   │   │   └── books-api/          # 楽天ブックスAPI / Google Books API呼び出し
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

## 4. 設計判断の根拠

| 判断                                       | 理由                                                            |
| ------------------------------------------ | --------------------------------------------------------------- |
| pnpm workspaces モノレポ                   | `packages/shared` で型・スキーマ共有。Turborepoは現段階では過剰 |
| `(auth)` / `(protected)` ルートグループ    | 認証済み・未認証で layout と保護を分離                          |
| `lib/supabase/` を3ファイルに分割          | Cloudflare Edge Runtime + `@supabase/ssr` の推奨パターン        |
| `components/layout/` と `features/` を分離 | layoutは構造的関心事、featuresは機能的関心事                    |
| `duplicate-alert/` はUIのみ                | 重複検知ロジックは `api/scrape` サーバー側に置く                |
| `extension/content/shared/`                | ストアをまたぐパース・API送信ロジックをDRY化                    |
| `packages/shared/schemas/` にZodスキーマ   | Extension→Web API間のデータ整合性を両側で保証                   |

---

## 5. Cloudflare Pages Edge Runtime の制約

- Node.js固有API（`fs`、`Buffer`の一部等）は使用不可
- 各Route Handlerファイルに `export const runtime = 'edge'` が必要
- `supabase-js` はEdge互換のため問題なし
- 長時間処理（重いスクレイピング等）はサーバー側では行わない

---

## 6. 環境変数

`.env.example` をルートに配置し、チーム共有用テンプレートとする。実際の値は `apps/web/.env.local` に記載（gitignore対象）。

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 書籍情報API（どちらか一方）
RAKUTEN_APP_ID=
GOOGLE_BOOKS_API_KEY=
```
