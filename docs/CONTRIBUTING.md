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

| コマンド             | 説明                                                    |
| -------------------- | ------------------------------------------------------- |
| `pnpm dev`           | Web アプリの開発サーバーを起動 (localhost:3000)         |
| `pnpm build`         | 全パッケージをビルド                                    |
| `pnpm test`          | 全パッケージでテストを実行                              |
| `pnpm test:coverage` | テスト + カバレッジレポート生成                         |
| `pnpm lint`          | 全パッケージで ESLint を実行                            |
| `pnpm fix`           | lint 自動修正 + Prettier フォーマット（コミット前推奨） |
| `pnpm format`        | Prettier でコードを整形                                 |
| `pnpm format:check`  | フォーマットのチェックのみ（整形しない）                |

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

## テスト

### テストの実行

```bash
# 全パッケージでテストを実行
pnpm test

# 特定のパッケージのみ実行
pnpm --filter web test
pnpm --filter @bookhub/shared test

# ウォッチモード（ファイル変更時に自動再実行）
pnpm test -- --watch

# カバレッジレポート生成
pnpm test:coverage
```

### テストの書き方

- Vitest を使用
- テストファイルは実装ファイルと同じディレクトリに `__tests__` フォルダ配下に配置（例: `lib/scrape/process-scrape.ts` → `lib/scrape/__tests__/process-scrape.test.ts`）
- TDD（Test-Driven Development）を推奨：テスト作成 → 実装 → リファクタリングの順序で進める
- API エンドポイントは 80% 以上のカバレッジが必要（認証・バリデーション・エラーハンドリングをテストする）

### テストの種類

| 種類            | 対象                 | 例                                                         |
| --------------- | -------------------- | ---------------------------------------------------------- |
| **Unit**        | 関数・クラス         | `processScrapePayload()`, Zod スキーマ検証                 |
| **Integration** | API エンドポイント   | `POST /api/scrape` の認証 + バリデーション + Supabase 連携 |
| **Middleware**  | Next.js ミドルウェア | Cookie 認証、ルート保護                                    |

## API エンドポイントリファレンス

### `POST /api/scrape` — Chrome 拡張機能用スクレイピング API

Chrome 拡張機能がスクレイピングした書籍データを Supabase に保存します。重複検知を行い、既に登録済みの書籍は二度買い防止アラートの対象になります。

#### 認証

Bearer トークン（Supabase の ID トークン）が必須。Authorization ヘッダーで指定します。

```
Authorization: Bearer <SUPABASE_ID_TOKEN>
```

#### リクエスト

```typescript
POST /api/scrape
Content-Type: application/json
Authorization: Bearer <token>

{
  "books": [
    {
      "title": "ワンピース",           // 書籍名（必須）
      "author": "尾田栄一郎",          // 著者（必須）
      "volumeNumber": 107,             // 巻数（オプション）
      "store": "kindle",               // ストア: "kindle" | "dmm" | その他（必須）
      "isAdult": false                 // 成人向けフラグ（オプション、デフォルト: false）
    }
  ]
}
```

#### レスポンス

```typescript
// 成功時（200 OK）
{
  "savedCount": 1,                     // 新規保存された書籍数
  "duplicateCount": 1,                 // 重複検知された数（異なるストアで既存）
  "duplicates": [
    {
      "title": "ワンピース",
      "volumeNumber": 107,
      "existingStores": ["dmm"]        // 既に持っているストア一覧
    }
  ]
}
```

#### エラーレスポンス

```typescript
// 認証失敗（401 Unauthorized）
{ "error": "unauthorized", "message": "Missing Bearer token" }

// バリデーション失敗（400 Bad Request）
{ "error": "validation_error", "message": "Request body validation failed" }

// 無効な JSON（400 Bad Request）
{ "error": "invalid_json", "message": "Request body is not valid JSON" }

// サーバーエラー（500 Internal Server Error）
{ "error": "internal_error", "message": "An unexpected error occurred" }
```

#### CORS

Chrome 拡張機能は CORS の制約を受けないため、本エンドポイントは CORS ヘッダーを返しません。OPTIONS メソッドは認証なしでアクセス可能（プリフライトの仕様に対応）。

#### レート制限

Edge Runtime はステートレスのため、レート制限は Cloudflare WAF のレートリミットルール（`cf:rule_id=...`）で管理します。設定手順は Cloudflare ダッシュボード → Security → WAF Rules を参照してください。

#### 実装例（Chrome 拡張機能）

```typescript
const token = await chrome.identity.getAuthToken({ interactive: true })
const response = await fetch('https://bookshelf.local/api/scrape', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({
    books: [{ title: 'ワンピース', author: '尾田栄一郎', volumeNumber: 107, store: 'kindle' }],
  }),
})

const result = await response.json()
console.log(`保存: ${result.savedCount}, 重複: ${result.duplicateCount}`)
result.duplicates.forEach((dup) => {
  console.warn(`${dup.title} は ${dup.existingStores.join(', ')} で既に持っています`)
})
```

## コードスタイル

- TypeScript strict モード（`tsconfig.base.json` 参照）
- ESLint flat config + Prettier（`pnpm fix` で一括自動修正）
- husky の pre-commit フックにより、コミット時に `pnpm lint` と `pnpm format:check` が自動実行される
- コミット前に `pnpm fix` を実行して問題を解消しておくことを推奨

## PR チェックリスト

- [ ] `pnpm build` が通る
- [ ] `pnpm test` が通る（カバレッジ 80% 以上）
- [ ] `pnpm lint` が通る
- [ ] `pnpm format:check` が通る
- [ ] 関連 Issue 番号をコミットメッセージまたは PR 本文に記載
- [ ] API エンドポイント変更の場合は本セクションの「API エンドポイントリファレンス」を更新
