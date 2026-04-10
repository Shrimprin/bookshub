# Contributing Guide

<!-- AUTO-GENERATED: scripts/commands section generated from package.json -->

## 開発環境のセットアップ

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
# .env.local を編集して各値を設定
```

## コマンドリファレンス（ルート）

| コマンド | 説明 |
|---------|------|
| `pnpm dev` | Web アプリの開発サーバーを起動 (localhost:3000) |
| `pnpm build` | 全パッケージをビルド |
| `pnpm lint` | 全パッケージで ESLint を実行 |
| `pnpm format` | Prettier でコードを整形 |
| `pnpm format:check` | フォーマットのチェックのみ（整形しない） |

## パッケージ別コマンド

### apps/web

| コマンド | 説明 |
|---------|------|
| `pnpm --filter web dev` | 開発サーバー |
| `pnpm --filter web build` | Next.js ビルド |
| `pnpm --filter web pages:build` | Cloudflare Pages 用ビルド |
| `pnpm --filter web preview` | Cloudflare Pages をローカルでプレビュー |
| `pnpm --filter web deploy` | Cloudflare Pages へデプロイ |

### apps/extension

| コマンド | 説明 |
|---------|------|
| `pnpm --filter extension dev` | 拡張機能の開発ビルド（HMR あり） |
| `pnpm --filter extension build` | 拡張機能の本番ビルド |

### packages/shared

| コマンド | 説明 |
|---------|------|
| `pnpm --filter @bookhub/shared build` | 型定義・スキーマをビルド |

## 環境変数リファレンス

<!-- AUTO-GENERATED: generated from .env.example -->

| 変数 | 必須 | 説明 |
|-----|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase 匿名キー（クライアントサイドで使用） |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase サービスロールキー（サーバーサイドのみ） |
| `RAKUTEN_APP_ID` | No* | 楽天ブックス API のアプリ ID |
| `GOOGLE_BOOKS_API_KEY` | No* | Google Books API キー |

*書籍情報 API はどちらか一方が必要

<!-- /AUTO-GENERATED -->

## コードスタイル

- TypeScript strict モード（`tsconfig.base.json` 参照）
- ESLint + Prettier（`pnpm format` で自動整形）
- コミット前に `pnpm lint && pnpm format:check` が通ることを確認

## PR チェックリスト

- [ ] `pnpm build` が通る
- [ ] `pnpm lint` が通る
- [ ] `pnpm format:check` が通る
- [ ] 関連 Issue 番号をコミットメッセージまたは PR 本文に記載
