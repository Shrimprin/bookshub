# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**BookHub** — 漫画ヘビーユーザー向け本棚管理・二度買い防止サービス。複数の電子書籍ストア（KindleやDMM等）に散らばった蔵書をChrome拡張機能経由で自動取得し、Webアプリで一元管理する。

## Planned Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (App Router), TypeScript, Tailwind CSS, shadcn/ui |
| Hosting | Cloudflare Pages (`@cloudflare/next-on-pages`) |
| BaaS | Supabase (Auth + PostgreSQL with RLS) |
| Chrome Extension | Vite + CRXJS Vite Plugin, TypeScript |
| Linter/Formatter | ESLint + Prettier (via `eslint-config-prettier`) |
| PackageManager | pnpm |

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

- `docs/` — 要求定義書・MVP仕様・技術スタック定義書
- Cloudflare Pages Edge RuntimeはNode.js APIの一部が使用不可。`@cloudflare/next-on-pages`の制約に注意。
- 成人向けコンテンツと一般向けコンテンツは本棚を分離・隠蔽可能にする設計が必要。
