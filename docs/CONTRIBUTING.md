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

### 環境変数セットアップ

Supabase と 書籍情報 API の認証情報が必要です。

```bash
cp .env.example apps/web/.env.local
# .env.local を編集して各値を設定
```

詳細は下記の「[環境変数リファレンス](#環境変数リファレンス)」を参照してください。

#### Supabase キーの取得

1. [Supabase ダッシュボード](https://supabase.com/dashboard) にログイン
2. プロジェクト「bookshub」を選択
3. **Settings** → **API** で以下を確認：
   - `NEXT_PUBLIC_SUPABASE_URL`: Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: anon public キー
4. **Service role secret** は `.env.local` の `SUPABASE_SERVICE_ROLE_KEY` に設定（サーバーサイドのみで使用）

#### 書籍情報 API（どちらか一方）

- **Google Books API**: [Google Cloud Console](https://console.cloud.google.com/) で API キーを生成
- **楽天ブックス API**: [楽天デベロッパーサイト](https://webservice.rakuten.co.jp/) でアプリ ID を取得

## コマンドリファレンス（ルート）

| コマンド            | 説明                                                    |
| ------------------- | ------------------------------------------------------- |
| `pnpm dev`          | Web アプリの開発サーバーを起動 (localhost:3000)         |
| `pnpm build`        | 全パッケージをビルド                                    |
| `pnpm lint`         | 全パッケージで ESLint を実行                            |
| `pnpm fix`          | lint 自動修正 + Prettier フォーマット（コミット前推奨） |
| `pnpm format`       | Prettier でコードを整形                                 |
| `pnpm format:check` | フォーマットのチェックのみ（整形しない）                |

## パッケージ別コマンド

### apps/web

| コマンド                        | 説明                                    |
| ------------------------------- | --------------------------------------- |
| `pnpm --filter web dev`         | 開発サーバー                            |
| `pnpm --filter web build`       | Next.js ビルド                          |
| `pnpm --filter web pages:build` | Cloudflare Pages 用ビルド               |
| `pnpm --filter web preview`     | Cloudflare Pages をローカルでプレビュー |
| `pnpm --filter web deploy`      | Cloudflare Pages へデプロイ             |

### apps/extension

| コマンド                        | 説明                             |
| ------------------------------- | -------------------------------- |
| `pnpm --filter extension dev`   | 拡張機能の開発ビルド（HMR あり） |
| `pnpm --filter extension build` | 拡張機能の本番ビルド             |

### packages/shared

| コマンド                              | 説明                     |
| ------------------------------------- | ------------------------ |
| `pnpm --filter @bookhub/shared build` | 型定義・スキーマをビルド |

## 環境変数リファレンス

<!-- AUTO-GENERATED: generated from .env.example -->

| 変数                            | 必須 | 説明                                              |
| ------------------------------- | ---- | ------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes  | Supabase プロジェクト URL                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes  | Supabase 匿名キー（クライアントサイドで使用）     |
| `SUPABASE_SERVICE_ROLE_KEY`     | Yes  | Supabase サービスロールキー（サーバーサイドのみ） |
| `RAKUTEN_APP_ID`                | No\* | 楽天ブックス API のアプリ ID                      |
| `GOOGLE_BOOKS_API_KEY`          | No\* | Google Books API キー                             |

\*書籍情報 API はどちらか一方が必要

<!-- /AUTO-GENERATED -->

## コードスタイル

- TypeScript strict モード（`tsconfig.base.json` 参照）
- ESLint flat config + Prettier（`pnpm fix` で一括自動修正）
- husky の pre-commit フックにより、コミット時に `pnpm lint` と `pnpm format:check` が自動実行される
- コミット前に `pnpm fix` を実行して問題を解消しておくことを推奨

## PR チェックリスト

- [ ] `pnpm build` が通る
- [ ] `pnpm lint` が通る
- [ ] `pnpm format:check` が通る
- [ ] 関連 Issue 番号をコミットメッセージまたは PR 本文に記載
