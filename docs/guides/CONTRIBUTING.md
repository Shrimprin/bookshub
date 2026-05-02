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

| コマンド                        | 説明                                                        |
| ------------------------------- | ----------------------------------------------------------- |
| `pnpm --filter web dev`         | 開発サーバー                                                |
| `pnpm --filter web build`       | Next.js ビルド                                              |
| `pnpm --filter web pages:build` | Cloudflare Workers 用ビルド (`opennextjs-cloudflare build`) |
| `pnpm --filter web preview`     | Cloudflare Workers をローカルでプレビュー (`wrangler dev`)  |
| `pnpm --filter web deploy`      | Cloudflare Workers へデプロイ (`wrangler deploy`)           |

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

| コマンド                                      | 説明                                          |
| --------------------------------------------- | --------------------------------------------- |
| `pnpm --filter @bookhub/shared build`         | 型定義・スキーマ・Parser をビルド             |
| `pnpm --filter @bookhub/shared dev`           | TypeScript の watch モード                    |
| `pnpm --filter @bookhub/shared test`          | テスト実行（Zod スキーマ・Parser・deep-link） |
| `pnpm --filter @bookhub/shared test:watch`    | テストをウォッチモードで実行                  |
| `pnpm --filter @bookhub/shared test:coverage` | テストカバレッジレポート生成                  |

## 環境変数リファレンス

### Web アプリ （apps/web）

<!-- AUTO-GENERATED: generated from .env.example -->

| 変数                            | 必須   | 説明                                                                                          |
| ------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes    | Supabase プロジェクト URL                                                                     |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes    | Supabase 匿名キー（クライアントサイドで使用）                                                 |
| `SUPABASE_SERVICE_ROLE_KEY`     | Yes    | Supabase サービスロールキー（サーバーサイドのみ）                                             |
| `RAKUTEN_APP_ID`                | No\*   | 楽天ブックス API のアプリ ID                                                                  |
| `GOOGLE_BOOKS_API_KEY`          | No\*   | Google Books API キー                                                                         |
| `NEXT_PUBLIC_EXTENSION_ID`      | No\*\* | Chrome 拡張機能の ID。`chrome://extensions` で確認。未設定時はトークン送信を no-op でスキップ |

\*書籍情報 API はどちらか一方が必要
\*\*拡張機能連携を使う場合のみ必要（非秘密情報）

### Chrome 拡張機能 （apps/extension）

| 変数                          | 必須   | 説明                                                                                                                                     |
| ----------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `BOOKHUB_API_URL`             | Yes\*  | Web API ベース URL（ビルド時に指定、ビルドに埋め込まれる）                                                                               |
| `CRX_PUBLIC_KEY`              | No\*\* | Extension ID 固定化用の公開鍵 (base64)。dev ビルド時のみ使用（非秘密）                                                                   |
| `BOOKHUB_ALLOWED_WEB_ORIGINS` | No\*\* | Web アプリのオリジン（カンマ区切り）。dev は `localhost:3000` が自動設定、本番ビルドでは必須（パターン例: `https://bookhub.pages.dev/*`) |

\* 開発時: `localhost:3000`、本番ビルド時: HTTPS な本番 URL（必須）
\*\* `BOOKHUB_ALLOWED_WEB_ORIGINS` は本番ビルド（`--mode production`）時は必須。`CRX_PUBLIC_KEY` 未設定の場合、Extension ID は `chrome://extensions` でロードするたびに変わる可能性がある

#### 設定方法

**開発時:**

```bash
# Extension ID を固定化したい場合は CRX_PUBLIC_KEY も設定
CRX_PUBLIC_KEY=<base64 public key> \
BOOKHUB_API_URL=http://localhost:3000 \
pnpm --filter extension dev
```

**本番ビルド時:**

```bash
BOOKHUB_API_URL=https://bookshelf.example.com pnpm --filter extension build:prod
```

<!-- /AUTO-GENERATED -->

### Chrome 拡張機能 × Web アプリ 連携のセットアップ

1. `pnpm --filter extension dev` で拡張機能をビルド
2. Chrome で `chrome://extensions` を開き、デベロッパーモード ON
3. 「パッケージ化されていない拡張機能を読み込む」で `apps/extension/dist/` を指定
4. 表示された Extension ID を `apps/web/.env.local` の `NEXT_PUBLIC_EXTENSION_ID` に設定
5. （任意）`CRX_PUBLIC_KEY` を `.env` に設定して ID を固定化すると、以降の再読み込みで ID が変わらない
6. `pnpm dev` で Web アプリを起動してログイン

#### 取り込み操作のフロー (Web からの明示的トリガー)

Kindle 取り込みは **本棚画面の「Kindle から取り込み」ボタン** から起動する。
ユーザーが Kindle 購入履歴ページを単に閲覧した時に勝手にスクレイプは走らない。

1. ユーザーが `/bookshelf` の「Kindle から取り込み」ボタンを押す
2. Web → 拡張機能に `TRIGGER_SCRAPE { store: 'kindle' }` を送信
3. 拡張機能 Background が背景タブを開き (`chrome.tabs.create({ url: '...?pageNumber=1', active: false })`)、
   返ってきた `tab.id` を含めて `chrome.storage.session` に trigger flag を書き込む
   (順序は tab 作成 → flag 書込。flag に `tabId` を持たせるため)
4. Content Script (`kindle.ts`) は flag 存在 + TTL 内 + `IS_TRIGGER_TAB` RPC で
   自タブが trigger.tabId と一致することを確認した時だけスクレイプを実行
5. 完了 / 全エラー時に Background が flag を先に clear し、続いてタブを閉じ、
   `bookhub_last_sync_result` に `errorCode`, `durationMs`, `pagesScraped`,
   `trigger='web'` 等を記録 (順序: flag clear → tabs.remove。逆だと `onRemoved` が
   先に走って成功結果を上書きするレースが発生する)
6. 本棚タブが自動リロードされて結果が表示される

ユーザーが手動でトリガータブを閉じた場合は `chrome.tabs.onRemoved` リスナーが
flag を回収し、`status: 'error'` の lastSyncResult を書く。

`chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })`
は SW 起動時のトップレベルで一度実行され、content script から flag を読めるようにする。

#### 動作確認チェックリスト

- [ ] `/login` からログインできる
- [ ] ログイン後、拡張機能のポップアップが「ログイン中」に変わる
- [ ] Kindle 購入履歴ページを **直接 URL バーで開く** とスクレイプが走らない
      (Console に `no active trigger, skipping (manual visit)` のログ)
- [ ] 本棚 `/bookshelf` の「Kindle から取り込み」ボタンを押すと
      新規タブが背景 (`active: false`) で開きスクレイプが完了後に閉じる
- [ ] 連続クリックすると 2 回目は「進行中」表示で新規タブが追加で開かない
- [ ] 拡張機能を未インストール状態でボタンを押すと「拡張機能が見つかりません」と表示される
- [ ] 取り込み中にトリガータブを手動で閉じると flag が回収され次の trigger が即受け付けられる
- [ ] 累積完了後、ポップアップに同期結果 (`N 冊を同期しました`) が表示される
- [ ] Web アプリでログアウトすると、ポップアップが「未ログイン」に戻る

#### Kindle ページネーション動作確認 (累積セッション)

- [ ] 3 ページ以上ある購入履歴でボタンを押すと、ページ 1 から自動で 2, 3, ... と進み最終ページで送信される
- [ ] 累積中にポップアップを開くと「Kindle 同期中: ページ N まで完了 / M 冊蓄積」と表示される
- [ ] AUTH_ERROR 発生時 (未ログイン状態でボタンを押す) は本棚側に「Kindle ログインが必要」相当の lastSyncResult が記録される

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

拡張機能のテストでは、`jsdom` で DOM 環境をシミュレートし、`chrome` グローバルオブジェクトをモック化して実行します：

```bash
# 拡張機能テストの実行
pnpm --filter extension test

# ウォッチモード
pnpm --filter extension test:watch

# カバレッジレポート
pnpm --filter extension test:coverage
```

**テスト範囲:**

- **Service Worker** (`src/background/__tests__/`):
  - メッセージハンドリング
  - Content Script ↔ Background 通信
  - Token ライフサイクル（取得・保存・削除）
  - API エラーハンドリング（401/400/500）
  - 本棚タブリロード動作

- **Content Script - Kindle** (`src/content/__tests__/kindle.test.ts`):
  - ページ判定（URL パターンマッチ）
  - DOM スクレイピング
  - タイムアウト処理（`waitForElement()`）
  - Service Worker への送信

- **Sender** (`src/content/shared/__tests__/sender.test.ts`):
  - Service Worker へのメッセージ送信
  - エラーハンドリング

- **Scrape Session** (`src/content/shared/__tests__/scrape-session.test.ts`):
  - 累積セッションのライフサイクル（開始・更新・完了・期限切れ）

> Parser は `packages/shared/src/parser/__tests__/title-parser.test.ts` に移管済み。
> Web 側の defensive parse 用にも同一実装が共有される（詳細は後述「Parser」節）。

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

### `GET /api/books/search` — 外部 API で書籍を検索

楽天ブックス API（プライマリ）または Google Books API（フォールバック）を使って書籍を検索します。手動登録 UI のための候補取得用エンドポイント。

#### リクエスト

```text
GET /api/books/search?q=ワンピース&page=1&limit=10
Authorization: Bearer <token>
```

| パラメータ | 型     | 必須 | 説明                                       |
| ---------- | ------ | ---- | ------------------------------------------ |
| `q`        | string | Yes  | 検索クエリ（タイトル/著者名、1〜200 文字） |
| `page`     | number | No   | ページ番号（デフォルト: 1、最大: 1000）    |
| `limit`    | number | No   | 件数（デフォルト: 10、最大: 30）           |

#### フォールバック戦略

1. 楽天ブックス API で検索（`RAKUTEN_APP_ID` 設定時）
2. 結果なし or エラー → Google Books API にフォールバック（`GOOGLE_BOOKS_API_KEY` 設定時）
3. 両方失敗 → `source: "none"` + エラー情報を返す（200 レスポンス）

詳細仕様は `docs/specs/openapi.yaml` の `/api/books/search` セクション参照。

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

## CSP nonce ガイド (Web)

`apps/web` は middleware で per-request nonce を生成し、`script-src 'self' 'nonce-{nonce}' 'strict-dynamic'` で運用している (詳細は `docs/specs/architecture.md` §6.5)。inline script を追加する際は以下のルールに従う。

- **inline `<script>` は必ず nonce を付与する**: Server Component なら `import { headers } from 'next/headers'` で `(await headers()).get('x-nonce')` を取得し、`<Script nonce={nonce}>` (next/script) または `<script nonce={nonce}>` で渡す
- **サードパーティ script は `next/script` 経由 or 明示的に nonce を付与する**: `<script src="https://...">` 直書きは `'strict-dynamic'` 配下では nonce 未付与だと弾かれる。`next/script` を使えば自動付与されるため推奨。直接 `<script>` タグを使う必要がある場合は `<script src="..." nonce={nonce}>` のように `headers()` から取得した nonce を明示的に渡すこと
- **inline `style="..."` 属性は引き続き許可**: `style-src 'self' 'unsafe-inline'` を据え置いているため、Tailwind の static class や Radix Popper の動的 inline style はそのまま動く
- **CSP に新しい許可ホスト (img-src / connect-src / font-src 等) を追加する場合**: `apps/web/lib/csp/build-csp.ts` を編集する。`next.config.ts` に CSP は無いので注意

## Extension 開発ガイド

### Content Script の実装パターン

各ストアの Content Script は以下のパターンで実装：

```
1. ページ判定（isKindleContentPage()）
   ↓
2. DOM 待機（waitForElement()）
   ↓
3. スクレイピング（scrapeKindleBooks()）
   ↓
4. 正規化（parseBooks()）
   ↓
5. Service Worker へ送信（sendScrapedBooks()）
```

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

### Parser（packages/shared/src/parser/title-parser.ts）

生データから共通の `ScrapeBook[]` 型に正規化。Chrome 拡張と Web の両方で利用するため
`packages/shared` に配置している（拡張ビルドの旧バージョンが流入した汚染データを
サーバ側で再 parse する defense in depth 用途）。

```typescript
import { extractVolumeNumber, extractSeriesTitle, parseBooks } from '@bookhub/shared'

// 巻数抽出
extractVolumeNumber('ワンピース 107巻') // → 107

// シリーズタイトル正規化
extractSeriesTitle('ワンピース 107巻 特装版') // → 'ワンピース'

// 一括パース
const books = parseBooks(rawBooks, 'kindle')
```

対応パターン：

- 「第1巻」「1巻」「(1)」「(01)」「Vol.1」「vol 1」
- 末尾の Kindle 出版社ラベル除去：「(ジャンプコミックスDIGITAL)」「(BOOKS)」等
- 全角英数字の正規化（`normalizeWidth`）
- 修飾語除去：「特装版」「限定版」「通常版」

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

## デプロイ (Cloudflare Workers)

`apps/web` は `@opennextjs/cloudflare` 経由で Cloudflare Workers にデプロイする。`apps/web/wrangler.jsonc` が Worker 設定、`.github/workflows/cd.yml` が CD ワークフロー。

### CD ワークフロー全体像

| トリガー                 | ワークフロー     | 動作                                                        |
| ------------------------ | ---------------- | ----------------------------------------------------------- |
| `push` to `main`         | `cd.yml`         | Worker `bookhub-web` に本番デプロイ。承認制 (production)    |
| `pull_request` to `main` | `cd-preview.yml` | Worker `bookhub-web-pr-<番号>` にプレビューデプロイ         |
| `workflow_dispatch` (CD) | `cd.yml`         | 本番デプロイの手動再実行 (rollback の補助 / 初回手動実行用) |

### 初回セットアップ (ユーザー手動作業)

#### 1. Cloudflare API Token の発行

1. https://dash.cloudflare.com/profile/api-tokens を開く
2. **Create Token** → **Custom token** を選択
3. パーミッション (最小権限):
   - `Account` → `Workers Scripts` → `Edit`
   - `Account` → `Account Settings` → `Read`
   - `User` → `User Details` → `Read`
4. **Account Resources**: 自分のアカウントのみに限定
5. 生成された token を控える (ページを離れると再表示不可)

R2 / KV / D1 を導入する別 issue で token を再発行 or 権限追加。

#### 2. Cloudflare Account ID の取得

1. https://dash.cloudflare.com/ を開く
2. 右サイドバーの **Account ID** をコピー

#### 3. Supabase プロジェクトの準備 (本番 + preview の 2 つ)

##### 3-a. 本番用 Supabase プロジェクト

1. https://supabase.com/dashboard で本番用プロジェクトを開く
2. **Project Settings** → **API** で `Project URL` と `anon public` キーを控える
3. **Authentication** → **URL Configuration**:
   - **Site URL**: `https://bookhub-web.<account>.workers.dev`
   - **Redirect URLs**: 上記 + ローカル開発用 `http://localhost:3000`

##### 3-b. preview 用 Supabase プロジェクト

本番 DB の汚染を防ぐため別プロジェクトを作成する。

1. **New Project** で `bookhub-preview` 等を作成
2. 本番と同じスキーマを適用 (migration を流す)
3. **Project Settings** → **API** で URL / anon key を控える
4. **Authentication** → **URL Configuration**:
   - **Site URL**: `https://bookhub-web-pr-1.<account>.workers.dev` (暫定)
   - **Redirect URLs**: `https://bookhub-web-pr-*.<account>.workers.dev/auth/callback` + `http://localhost:3000`

#### 4. GitHub Environment `production` の作成

1. **Settings** → **Environments** → **New environment** → 名前 `production`
2. **Required reviewers**: 自分自身を追加 (誤デプロイ防止)
3. **Deployment branches and tags**: `main` のみ許可

#### 5-pre. Repository Variable `CLOUDFLARE_WORKERS_SUBDOMAIN` の登録

CD ワークフローは Worker URL を `https://bookhub-web.${{ vars.CLOUDFLARE_WORKERS_SUBDOMAIN }}.workers.dev` の形で組み立てる。

1. **Settings** → **Secrets and variables** → **Actions** → **Variables** タブ
2. **New repository variable** で以下を登録:
   - Name: `CLOUDFLARE_WORKERS_SUBDOMAIN`
   - Value: Cloudflare アカウントの Workers サブドメイン (例: アカウントが `kuroneko-acc` なら `kuroneko-acc`)
   - 確認方法: Cloudflare ダッシュボード → **Workers & Pages** → 任意の Worker をクリック → URL `https://<worker-name>.<subdomain>.workers.dev` の `<subdomain>` 部分

Repository Variable は secret ではないため平文で表示されるが、サブドメイン名自体は公開情報のため問題ない。production / preview の両方のワークフローで参照される。

#### 5. `production` Environment Secrets の登録

| Secret 名                       | 値                      |
| ------------------------------- | ----------------------- |
| `CLOUDFLARE_API_TOKEN`          | 1 で発行した token      |
| `CLOUDFLARE_ACCOUNT_ID`         | 2 で取得した Account ID |
| `NEXT_PUBLIC_SUPABASE_URL`      | 3-a の Project URL      |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 3-a の anon key         |

> **注意**: `NEXT_PUBLIC_*` 接頭辞の値は client bundle に inline される前提のもののみに使用。サーバ専用シークレット (Supabase `service_role` key 等) は `NEXT_PUBLIC_` を付けず、Cloudflare 側 (`wrangler secret put`) または GitHub Environment Secrets + サーバ側 env から読む運用に分離する。
>
> Repository Secrets ではなく Environment Secrets に登録すること。

#### 6. GitHub Environment `preview` の作成と Secrets 登録

Phase 4 (PR preview) 着手前に必要。

1. **Settings** → **Environments** → **New environment** → 名前 `preview`
2. **Required reviewers**: 設定なし (PR ごとの承認待ちは過剰)
3. **Deployment branches and tags**: All branches (forked PR は workflow の `if` で除外する)
4. Environment Secrets:

| Secret 名                       | 値                                              |
| ------------------------------- | ----------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`          | 1 と同じ (または preview 専用 token を別発行)   |
| `CLOUDFLARE_ACCOUNT_ID`         | 2 と同じ                                        |
| `NEXT_PUBLIC_SUPABASE_URL`      | **3-b の preview 用 Project URL** (本番とは別!) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **3-b の preview 用 anon key** (本番とは別!)    |

#### 7. ブランチ保護ルール (main) の設定

1. **Settings** → **Branches** → **Add branch ruleset**
2. **Branch name pattern**: `main`
3. ルール:
   - **Require a pull request before merging**: ON
   - **Require status checks to pass**: ON
     - Required: `Lint`, `Format`, `Test`, `Build`
     - Require branches to be up to date before merging: ON
   - **Restrict deletions**: ON

CD は post-merge トリガーなので required status check には含めない (含められない)。

#### 8. 初回手動デプロイで動作確認

1. **Actions** タブから `CD` ワークフローを `workflow_dispatch` で手動実行
2. **Review deployments** で `production` environment を承認
3. 各ステップが緑になることを確認
4. Cloudflare ダッシュボードで `bookhub-web` Worker が作成され、URL `https://bookhub-web.<account>.workers.dev` でアクセスできることを確認

### Rollback 手順

main に壊れた変更がマージされて本番が落ちた場合:

| 手段               | 操作                                                                                                                                                           | 所要時間 |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **A (推奨・即効)** | Cloudflare ダッシュボード → `bookhub-web` Worker → **Deployments / Versions** タブから 1 つ前の version を **Rollback** で再 activate                          | < 1 分   |
| **B (Git で戻す)** | 直前の正常 commit に対して `git revert` PR を作成 → main に merge → CD が再走                                                                                  | 5-10 分  |
| **C (将来課題)**   | `wrangler versions upload` + `wrangler versions deploy` ベースの段階的 rollout (gradual deployment) は MVP では導入しないが、本番 traffic が増えた時点で再評価 | -        |

`workflow_dispatch` での再実行は HEAD = 壊れた main commit を再 deploy するだけなので **rollback にならない**点に注意。

### Custom Domain (follow-up issue)

本 issue では `*.workers.dev` ドメインで運用。Custom Domain 適用時は以下を別 issue で実施:

- Cloudflare Workers Custom Domains の設定
- Supabase Auth Site URL / Redirect URLs を Custom Domain に更新
- CSP の `connect-src` 等を Custom Domain に更新

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
