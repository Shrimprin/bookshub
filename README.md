# BooksHub

漫画ヘビーユーザー向け本棚管理・二度買い防止サービス。

複数の電子書籍ストア（KindleやDMM等）に散らばった蔵書をChrome拡張機能経由で自動取得し、Webアプリで一元管理する。

## 主な機能（MVP）

- **書影ギャラリー** — 購入ストアのタグ付きで蔵書を一覧表示
- **二度買い防止アラート** — 登録済みの書籍を再購入しようとした際に警告
- **手動登録** — 書籍名で検索して蔵書を登録（楽天ブックスAPI / Google Books API）
- **次巻ステータス** — 所持最新巻の次巻が発売済みか確認

## 技術スタック

| Layer            | Technology                                                      |
| ---------------- | --------------------------------------------------------------- |
| Frontend         | Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui |
| Hosting          | Cloudflare Pages (`@opennextjs/cloudflare`)                     |
| BaaS             | Supabase (Auth + PostgreSQL + RLS)                              |
| Chrome Extension | Vite + CRXJS Vite Plugin, TypeScript                            |
| Package Manager  | pnpm workspaces (monorepo)                                      |

## リポジトリ構成

```
bookhub/
├── apps/
│   ├── web/        # Next.js Webアプリ
│   └── extension/  # Chrome拡張機能
├── packages/
│   └── shared/     # 型定義・Zodスキーマ（@bookhub/shared）
├── supabase/
│   └── migrations/ # DBマイグレーション
└── docs/           # 設計ドキュメント
```

## セットアップ

### 必要環境

- Node.js 20+
- pnpm 9+

### インストール

```bash
pnpm install
```

### 環境変数

```bash
cp .env.example apps/web/.env.local
# .env.local を編集して Supabase の接続情報を設定
```

### 開発サーバー起動

```bash
# Webアプリ
pnpm dev

# Chrome拡張機能（別ターミナル）
pnpm --filter extension dev
```

`pnpm dev` 起動後、[http://localhost:3000](http://localhost:3000) にアクセス。

Chrome拡張機能は `apps/extension/dist/` を Chrome の「拡張機能を読み込む（デベロッパーモード）」でロードする。

Kindle の取り込みは Web 本棚画面 (`/bookshelf`) の「Kindle から取り込み」ボタンから実行する。Kindle 購入履歴ページを直接開いても自動でスクレイプは走らない（プライバシー・UX 配慮）。

### ビルド

```bash
# 全パッケージ
pnpm build

# Cloudflare Pages 用ビルド
pnpm --filter web pages:build
```

### Lint / Format

```bash
pnpm lint          # lint チェック
pnpm fix           # lint 自動修正 + prettier フォーマット（コミット前推奨）
pnpm format:check  # フォーマットチェックのみ
```

> pre-commit フック（husky）により、コミット時に lint と format チェックが自動実行されます。

## ドキュメント

- [`docs/README.md`](docs/README.md) — ドキュメント索引・クイックナビ
- [`docs/guides/CONTRIBUTING.md`](docs/guides/CONTRIBUTING.md) — 開発環境セットアップ・コマンドリファレンス
- [`docs/requirements/requirement_definition.md`](docs/requirements/requirement_definition.md) — 要求定義書
- [`docs/requirements/mvp.md`](docs/requirements/mvp.md) — MVP仕様
- [`docs/specs/tech_stack.md`](docs/specs/tech_stack.md) — 技術スタック定義書
- [`docs/specs/architecture.md`](docs/specs/architecture.md) — アーキテクチャ定義書
- [`docs/specs/DB_SCHEMA.md`](docs/specs/DB_SCHEMA.md) — データベーススキーマ定義（テーブル・制約・RLS）
- [`docs/specs/openapi.yaml`](docs/specs/openapi.yaml) — API 仕様書（OpenAPI 3.1.0）
