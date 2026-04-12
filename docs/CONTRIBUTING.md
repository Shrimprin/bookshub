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

| コマンド                                | 説明                                                    |
| --------------------------------------- | ------------------------------------------------------- |
| `pnpm --filter extension dev`           | 拡張機能の開発ビルド（HMR あり、localhost:3000 を使用） |
| `pnpm --filter extension build`         | 拡張機能の開発用ビルド（`--mode development`）          |
| `pnpm --filter extension build:prod`    | 拡張機能の本番ビルド（`--mode production`、HTTPS 必須） |
| `pnpm --filter extension lint`          | ESLint でコード品質をチェック                           |
| `pnpm --filter extension test`          | ユニットテストを実行                                    |
| `pnpm --filter extension test:watch`    | ユニットテストをウォッチモードで実行                    |
| `pnpm --filter extension test:coverage` | テストカバレッジレポート生成                            |

### packages/shared

| コマンド                              | 説明                     |
| ------------------------------------- | ------------------------ |
| `pnpm --filter @bookhub/shared build` | 型定義・スキーマをビルド |

## 環境変数リファレンス

### Web アプリ （apps/web）

<!-- AUTO-GENERATED: generated from .env.example -->

| 変数                            | 必須 | 説明                                              |
| ------------------------------- | ---- | ------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes  | Supabase プロジェクト URL                         |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes  | Supabase 匿名キー（クライアントサイドで使用）     |
| `SUPABASE_SERVICE_ROLE_KEY`     | Yes  | Supabase サービスロールキー（サーバーサイドのみ） |
| `RAKUTEN_APP_ID`                | No\* | 楽天ブックス API のアプリ ID                      |
| `GOOGLE_BOOKS_API_KEY`          | No\* | Google Books API キー                             |

\*書籍情報 API はどちらか一方が必要

### Chrome 拡張機能 （apps/extension）

| 変数              | 必須  | 説明                                                       |
| ----------------- | ----- | ---------------------------------------------------------- |
| `BOOKHUB_API_URL` | Yes\* | Web API ベース URL（ビルド時に指定、ビルドに埋め込まれる） |

\* 開発時: `localhost:3000`、本番ビルド時: HTTPS な本番 URL（必須）

#### 設定方法

**開発時:**

```bash
BOOKHUB_API_URL=http://localhost:3000 pnpm --filter extension dev
```

**本番ビルド時:**

```bash
BOOKHUB_API_URL=https://bookshelf.example.com pnpm --filter extension build:prod
```

<!-- /AUTO-GENERATED -->

## テスト

### テストの実行

```bash
# 全パッケージでテストを実行
pnpm test

# 特定のパッケージのみ実行
pnpm --filter web test
pnpm --filter extension test
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
| **Extension**   | Chrome 拡張機能      | メッセージハンドリング、ストレージ操作、API 通信           |

### Chrome 拡張機能テスト

拡張機能のテストでは、`chrome` グローバルオブジェクトをモック化して実行します：

```bash
# 拡張機能テストの実行
pnpm --filter extension test

# ウォッチモード
pnpm --filter extension test:watch

# カバレッジレポート
pnpm --filter extension test:coverage
```

**テスト範囲:**

- Service Worker メッセージハンドリング
- Content Script ↔ Background 通信
- Token ライフサイクル（取得・保存・削除）
- API エラーハンドリング（401/400/500）
- 本棚タブリロード動作

## API エンドポイントリファレンス

### `POST /api/scrape` — Chrome 拡張機能用スクレイピング API

Chrome 拡張機能がスクレイピングした書籍データを Supabase に保存します。重複検知を行い、既に登録済みの書籍は二度買い防止アラートの対象になります。

#### 認証

Bearer トークン（Supabase の ID トークン）が必須。Authorization ヘッダーで指定します。

```text
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

本番デプロイ前に、以下のエンドポイントに対して WAF ルールを設定することが必須です：

- `/api/scrape`
- `/api/books`
- `/api/books/[id]`

#### セキュリティに関する注記

- `thumbnailUrl` は Amazon（m.media-amazon.com, images-na.ssl-images-amazon.com 等）と DMM（pics.dmm.co.jp, p.dmm.co.jp）のドメインのみを許可しています。これは stored XSS を防ぐためです。
- 全エンドポイントは Bearer トークン（Supabase ID トークン）で認証されます。
- `/api/books` エンドポイント（GET/POST/PATCH/DELETE）はすべて、RLS と明示的な `user_id` フィルタの二重防御で個人データを保護しています。

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

### `GET /api/books` — 蔵書一覧取得

ログインユーザーの蔵書一覧を取得します。検索・フィルタ・ページネーションに対応。

#### リクエスト

```text
GET /api/books?q=ワンピ&store=kindle&isAdult=false&page=1&limit=20
Authorization: Bearer <token>
```

| パラメータ | 型     | 必須 | 説明                                              |
| ---------- | ------ | ---- | ------------------------------------------------- |
| `q`        | string | No   | タイトル/著者名の部分一致（2文字以上200文字以下） |
| `store`    | string | No   | ストアフィルタ（kindle/dmm/other）                |
| `isAdult`  | string | No   | 成人向けフィルタ（true/false）                    |
| `page`     | number | No   | ページ番号（デフォルト: 1）                       |
| `limit`    | number | No   | 件数（デフォルト: 20、最大: 100）                 |

#### レスポンス（200 OK）

```json
{
  "books": [
    {
      "id": "book-uuid",
      "title": "ワンピース",
      "author": "尾田栄一郎",
      "volumeNumber": 107,
      "thumbnailUrl": "https://m.media-amazon.com/images/I/cover.jpg",
      "isbn": "9784088835099",
      "publishedAt": "2024-03-04",
      "isAdult": false,
      "createdAt": "2024-01-01T00:00:00Z",
      "userBookId": "user-book-uuid",
      "store": "kindle",
      "userBookCreatedAt": "2024-03-04T00:00:00Z"
    }
  ],
  "total": 1,
  "page": 1,
  "limit": 20
}
```

### `POST /api/books` — 書籍の手動登録

手動で書籍を登録します。別ストアで既に所持している場合は二度買い警告を返します。

#### リクエスト

```json
POST /api/books
Authorization: Bearer <token>

{
  "title": "ワンピース",
  "author": "尾田栄一郎",
  "volumeNumber": 107,
  "store": "kindle",
  "isAdult": false
}
```

#### レスポンス（201 Created）

```json
{
  "book": { "id": "...", "title": "ワンピース", ... },
  "alreadyOwned": true,
  "existingStores": ["dmm"]
}
```

#### エラー（409 Conflict）

同一ストアで既に登録済みの場合:

```json
{ "error": "conflict", "message": "この書籍は既に kindle で登録されています" }
```

### `PATCH /api/books/{id}` — store の更新

user_books レコードの store を更新します。`{id}` は user_books.id（UUID）。

```json
PATCH /api/books/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>

{ "store": "dmm" }
```

レスポンス: 更新後の `BookWithStore` オブジェクト（200 OK）。存在しない場合は 404。

### `DELETE /api/books/{id}` — 所持書籍の削除

user_books レコードを削除します。books マスタは削除しません。`{id}` は user_books.id（UUID）。

```text
DELETE /api/books/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer <token>
```

レスポンス: `{ "message": "Deleted" }`（200 OK）。存在しない場合は 404。

## コードスタイル

- TypeScript strict モード（`tsconfig.base.json` 参照）
- ESLint flat config + Prettier（`pnpm fix` で一括自動修正）
- husky の pre-commit フックにより、コミット時に `pnpm lint` と `pnpm format:check` が自動実行される
- コミット前に `pnpm fix` を実行して問題を解消しておくことを推奨

## Extension 開発ガイド

### メッセージ型定義

Content Script と Service Worker の通信は `src/types/messages.ts` で定義された型セーフなメッセージを使用します：

```typescript
// Content Script から送信
const response = await sendScrapedBooks(books)

// Service Worker で受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse)
  return true // 非同期レスポンス有効化
})
```

### ストレージ操作

トークン・同期結果の保存は `src/utils/storage.ts` の関数を使用：

```typescript
// トークン取得
const token = await getAccessToken()

// 同期結果保存
await setLastSyncResult({ status: 'success', savedCount: 1, ... })
```

### ローカルテスト

```bash
# 1. Web アプリをローカル実行
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... pnpm --filter web dev

# 2. 拡張機能を開発ビルド
BOOKHUB_API_URL=http://localhost:3000 pnpm --filter extension dev

# 3. Chrome で chrome://extensions を開き、dist/ フォルダをロード
```

## PR チェックリスト

- [ ] `pnpm build` が通る
- [ ] `pnpm test` が通る（カバレッジ 80% 以上）
- [ ] `pnpm lint` が通る
- [ ] `pnpm format:check` が通る
- [ ] 関連 Issue 番号をコミットメッセージまたは PR 本文に記載
- [ ] API エンドポイント変更の場合は本セクションの「API エンドポイントリファレンス」を更新
- [ ] Chrome 拡張機能変更の場合は以下を確認：
  - [ ] メッセージ型定義が `src/types/messages.ts` で正しく定義されている
  - [ ] `handleMessage()` の sender.id 検証が実装されている
  - [ ] エラーハンドリング（AUTH_ERROR/VALIDATION_ERROR/API_ERROR）が完備されている
  - [ ] Storage 操作に `src/utils/storage.ts` の関数を使用している
