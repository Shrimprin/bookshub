# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BookHub** — 漫画ヘビーユーザー向け本棚管理・二度買い防止サービス。複数の電子書籍ストア（KindleやDMM等）に散らばった蔵書をChrome拡張機能経由で自動取得し、Webアプリで一元管理する。

## Tech Stack

| Layer            | Technology                                                      |
| ---------------- | --------------------------------------------------------------- |
| Frontend         | Next.js 15 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui |
| Hosting          | Cloudflare Pages (`@opennextjs/cloudflare`)                     |
| BaaS             | Supabase (Auth + PostgreSQL with RLS)                           |
| Chrome Extension | Vite + CRXJS Vite Plugin, TypeScript                            |
| Linter/Formatter | ESLint (flat config) + Prettier                                 |
| Git Hooks        | husky (pre-commit: lint + format check)                         |
| PackageManager   | pnpm workspaces (monorepo)                                      |

## Architecture Overview

The system has two main components that share TypeScript type definitions:

1. **Web App (Next.js)** — ユーザーの本棚UI、認証、APIエンドポイント。Cloudflare PagesのEdge Runtimeで動作する。
2. **Chrome Extension (Vite/CRXJS)** — KindleやDMMのページからDOMをスクレイピングし、Next.jsのAPIエンドポイントへPOSTする。

### Data Flow

```
User → Supabase Auth → Chrome Extension scrapes store pages
→ POST to Next.js API → Supabase PostgreSQL
→ Next.js fetches data → shadcn/ui bookshelf UI
```

### Supabase RLS

各ユーザーは自分のデータのみアクセス可能。Row Level Security でバックエンド側で制御する。

## MVP Scope

実装対象:

- 書影ギャラリー表示（購入ストアのタグ付き）
- タイトル/作者名での絞り込み検索
- 書籍名検索からの手動登録（楽天ブックスAPI or Google Books API）
- 二度買い防止アラート（登録済みの場合に警告）
- 次巻のステータス表示

MVP対象外（フェーズ2以降）:

- ネイティブアプリ、最安値シミュレーター、プッシュ通知

## Development Notes

- `docs/README.md` — ドキュメント索引・クイックナビ
- `docs/requirements/requirement_definition.md` — 要求定義書（ビジネス要件・機能要件・UX要件）
- `docs/requirements/mvp.md` — MVP仕様（実装対象・対象外機能）
- `docs/specs/tech_stack.md` — 技術スタック定義書
- `docs/specs/architecture.md` — アーキテクチャ定義書（ディレクトリ構成・データフロー・設計判断の根拠）
- `docs/specs/sequence_diagrams.md` — シーケンス図（認証・スクレイピング・本棚表示・手動登録）
- `docs/specs/DB_SCHEMA.md` — データベーススキーマ定義(テーブル・RLS ポリシー)
- `docs/specs/openapi.yaml` — API 仕様書（OpenAPI 3.1.0）
- `docs/guides/CONTRIBUTING.md` — 開発環境セットアップ・コマンドリファレンス・テストガイド・PR チェックリスト
- Cloudflare Pages Edge RuntimeはNode.js APIの一部が使用不可。`@opennextjs/cloudflare`の制約に注意。
- 成人向けコンテンツと一般向けコンテンツは本棚を分離・隠蔽可能にする設計が必要。

## Common Commands

### ルート

```bash
pnpm dev          # Web アプリ開発サーバー起動
pnpm build        # 全パッケージビルド
pnpm lint         # 全パッケージ lint
pnpm fix          # lint 自動修正 + prettier フォーマット（コミット前推奨）
pnpm format:check # フォーマットチェックのみ
pnpm test         # 全パッケージテスト実行
```

### Chrome 拡張機能

```bash
pnpm --filter extension dev           # 拡張機能開発ビルド（HMR あり）
pnpm --filter extension build         # 拡張機能開発用ビルド
BOOKHUB_API_URL=https://... pnpm --filter extension build:prod # 本番ビルド（HTTPS 必須）
pnpm --filter extension test          # テスト実行
pnpm --filter extension test:watch    # テストウォッチ
pnpm --filter extension test:coverage # テストカバレッジ
```

pre-commit フック（husky）により、コミット時に `pnpm lint` と `pnpm format:check` が自動実行される。

## Everything Claude Code — エージェント使用モデル一覧

| モデル                                      | エージェント                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Opus 4.6** (`claude-opus-4-6`)            | `architect`, `chief-of-staff`, `planner`                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Sonnet 4.6** (`claude-sonnet-4-6`)        | `build-error-resolver`, `code-reviewer`, `cpp-build-resolver`, `cpp-reviewer`, `database-reviewer`, `docs-lookup`, `e2e-runner`, `flutter-reviewer`, `go-build-resolver`, `go-reviewer`, `harness-optimizer`, `java-build-resolver`, `java-reviewer`, `kotlin-build-resolver`, `kotlin-reviewer`, `loop-operator`, `python-reviewer`, `pytorch-build-resolver`, `refactor-cleaner`, `rust-build-resolver`, `rust-reviewer`, `security-reviewer`, `tdd-guide`, `typescript-reviewer` |
| **Haiku 4.5** (`claude-haiku-4-5-20251001`) | `doc-updater`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
