# Issue #32: store_product_id 追加とストアディープリンク派生

## Context

本棚 UI の次フェーズで「書籍カードをクリックすると購入ストアの商品ページを開く」体験を提供するための基盤整備。現状 Kindle スクレイパーは ASIN を抽出して書影 URL 生成に使うのみでサーバーに送っておらず、DB にも商品 ID カラムがない。ASIN を永続化し、`buildStoreUrl(store, productId)` で一元的に商品ページ URL を派生できるようにする。

後続 issue(UI 側の card クリック遷移、DMM コンテンツ ID 抽出) の土台。

## 影響範囲

- `packages/shared` — schema / 新規 util
- `apps/extension` — Kindle content script + parser
- `supabase/migrations` — DB スキーマ
- `apps/web` — scrape 保存パス + 取得パス
- `docs/specs/DB_SCHEMA.md` — スキーマドキュメント

## Phase 1: shared schema/型とディープリンクユーティリティ

### 1-1. `packages/shared/src/schemas/book-schema.ts`

`scrapeBookSchema` に追加 (isAdult の直前あたり、既存スタイル維持):

```ts
/**
 * ストア固有の商品ID。ASIN は 10 文字固定、DMM コンテンツ ID は実測 ~30 文字。
 * 余裕込みで 64 文字上限、制御文字弾きの allowlist を課す。
 */
storeProductId: z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.-]+$/, 'storeProductId は英数と ._- のみ許可')
  .optional(),
```

### 1-2. `packages/shared/src/schemas/books-api-schema.ts`

`bookWithStoreSchema` の `store` の直後に追加:

```ts
storeProductId: z.string().nullable(),
```

### 1-3. `packages/shared/src/types/book.ts`

`Book` interface に `storeProductId?: string` を追加 (互換性維持のため optional)。

### 1-4. 新規 `packages/shared/src/store/deep-link.ts`

```ts
import type { Store } from '../schemas/book-schema.js'

export function buildStoreUrl(store: Store, productId: string | null): string | null {
  if (!productId) return null
  switch (store) {
    case 'kindle':
      return `https://www.amazon.co.jp/dp/${encodeURIComponent(productId)}`
    case 'dmm':
      return `https://book.dmm.com/product/${encodeURIComponent(productId)}/`
    case 'other':
      return null
    default: {
      // Store に新 enum 値が増えた場合にコンパイルエラーで検知する
      const _exhaustive: never = store
      return _exhaustive
    }
  }
}
```

### 1-5. `packages/shared/src/index.ts`

`export * from './store/deep-link.js'` を追加。

### 1-6. テスト: `packages/shared/src/store/__tests__/deep-link.test.ts`

Vitest (既存 `__tests__/book-schema.test.ts` のスタイルに合わせる) で以下をカバー:

- `buildStoreUrl('kindle', 'B0XXXXXXXX')` → `https://www.amazon.co.jp/dp/B0XXXXXXXX`
- `buildStoreUrl('dmm', 'abc123/')` → URL エンコード (`abc123%2F`) 確認
- `buildStoreUrl('other', 'id')` → `null`
- `buildStoreUrl('kindle', null)` → `null`
- `buildStoreUrl('kindle', '')` → `null` (falsy)
- `buildStoreUrl('kindle', 'abc def')` → スペースが `%20` に encode される

### 1-7. 既存テスト更新

- `packages/shared/src/schemas/__tests__/book-schema.test.ts`: `storeProductId` の optional / 長さ境界 (1, 64, 65) の test を追加
- `packages/shared/src/schemas/__tests__/books-api-schema.test.ts`: `storeProductId: null` と文字列両ケースを追加

**Phase 1 完了時にコミット。**

## Phase 2: Extension (Kindle 経路で ASIN をパススルー)

### 2-1. `apps/extension/src/content/shared/parser.ts`

- `RawBookData` interface に `storeProductId?: string` を追加
- `parseBooks` で `storeProductId` を trim して ScrapeBook に passthrough (存在時のみ)

### 2-2. `apps/extension/src/content/kindle.ts`

`scrapeKindleBooks` 内で抽出済みの ASIN を `isValidAsin(asin)` 通過時のみ `RawBookData.storeProductId = asin` に格納 (既存の thumbnail URL 生成ロジックはそのまま維持)。

### 2-3. `apps/extension/src/content/dmm.ts`

スタブのまま。別 issue 対応 (コメントに `// TODO(#32+): extract content ID` だけ残すか、手を入れない)。

### 2-4. テスト更新

- `apps/extension/src/content/__tests__/kindle.test.ts`: 有効 ASIN で `storeProductId` が格納されること / 不正 ASIN ではフィールドが undefined であることを検証
- `apps/extension/src/content/shared/__tests__/parser.test.ts`: parser が `storeProductId` をパススルーすることを検証

**Phase 2 完了時にコミット。**

## Phase 3: DB マイグレーション

### 3-1. 新規マイグレーション

ファイル名: `supabase/migrations/20260418XXXXXX_books_store_product_id.sql` (timestamp は実行時に採番)

```sql
ALTER TABLE public.books
  ADD COLUMN store_product_id text;

CREATE INDEX books_store_product_id_idx
  ON public.books (store_product_id)
  WHERE store_product_id IS NOT NULL;

COMMENT ON COLUMN public.books.store_product_id IS
  'ストア固有の商品ID (Amazon ASIN / DMM コンテンツID 等)。NULL 可。';

-- Rollback runbook (Supabase は down migration を管理しないため手動実行):
--   DROP INDEX IF EXISTS public.books_store_product_id_idx;
--   ALTER TABLE public.books DROP COLUMN IF EXISTS store_product_id;
```

### 3-2. `docs/specs/DB_SCHEMA.md`

`books` テーブルのカラム表に以下の行を `is_adult` 直後あたりに追加:

```md
| `store_product_id` | text | NULL可 | ストア固有の商品ID (例: Amazon ASIN, DMM コンテンツID) |
```

併せてインデックス一覧セクションがあれば `books_store_product_id_idx` を記載。

**Phase 3 完了時にコミット。**

## Phase 4: Web (API 保存パスと取得パス)

### 4-1. `apps/web/lib/books/book-repository.ts`

- `BookRow` interface に `store_product_id: string | null` を追加
- `InsertBookInput` に `storeProductId?: string` を追加
- `insertBook` の INSERT で `store_product_id: input.storeProductId ?? null` を含める (既存の snake_case → camelCase マッピング踏襲)

### 4-2. `apps/web/lib/scrape/process-scrape.ts`

`insertBook` 呼び出し時に `storeProductId: book.storeProductId` を渡す。`findExistingBook` の一致条件は変更しない (Out of Scope: 既存行の事後補完)。

### 4-3. `apps/web/lib/books/get-user-books.ts`

- `UserBookWithBooks` interface の `books` オブジェクトに `store_product_id: string | null` を追加
- `select()` 句の `books!inner(...)` 列挙に `store_product_id` を追加
- 行 → `BookWithStore` マッピングで `storeProductId: row.books.store_product_id` を追加

### 4-4. テスト

- `apps/web/lib/books/__tests__/get-user-books.test.ts`: モックレスポンスに `store_product_id` を含め、マッピング結果に `storeProductId` が出現することを検証 (null ケースと値ありケース)
- `apps/web/lib/scrape/__tests__/process-scrape.test.ts`:
  - **既存ファイルがある場合**: Kindle book with `storeProductId` → `insertBook` に正しく渡ることを assert、DMM book (storeProductId なし) が null で保存されるケースも追加
  - **既存ファイルが無い場合**: 本 issue ではスコープ外として新規作成しない。PR 説明に「process-scrape の TDD 化は別 issue」と明記しスコープ肥大化を防ぐ

**Phase 4 完了時にコミット。**

## 検証手順

```bash
# 1. 型 / ビルド
pnpm -r build

# 2. Lint / Format
pnpm lint
pnpm format:check

# 3. テスト
pnpm -r test

# 4. DB マイグレーション適用 (ローカル Supabase)
supabase db reset   # もしくは supabase migration up

# 5. E2E 確認 (手動)
#    - Chrome 拡張を読み込み Kindle ライブラリで scrape
#    - POST /api/scrape のペイロードに storeProductId が載っていること
#    - books.store_product_id に ASIN が保存されていること
#    - /api/books レスポンスに storeProductId が含まれること
#    - buildStoreUrl('kindle', ASIN) が正しい URL を返すこと (REPL / vitest で確認)
```

## 完了条件 (Issue #32 より)

- [ ] 新規スクレイプで ASIN が `books.store_product_id` に保存される
- [ ] `buildStoreUrl` ユニットテスト (Kindle / DMM / other / null / encode) が通る
- [ ] `store_product_id IS NULL` 行で `buildStoreUrl` が `null` を返す
- [ ] `ScrapeBook` と `BookWithStore` 型に追加フィールドが反映され `pnpm -r build` が通る
- [ ] `DB_SCHEMA.md` に `store_product_id` の記載が追加されている

## Out of Scope

- 楽天ブックス等の追加ストア deep link
- レガシー行 (store_product_id NULL) の事後補完
- DMM content ID 抽出 (別 issue)
- 書籍カードの UI 変更 (クリック遷移は後続 issue)
- `(user_id, store, store_product_id)` UNIQUE 制約化 / ASIN ベース重複判定への移行 (別 issue)
- Supabase 自動生成型 (`supabase gen types typescript`) への移行 (ADR 別 issue)

## 主要変更ファイル一覧

| ファイル                                                         | 種別 |
| ---------------------------------------------------------------- | ---- |
| `packages/shared/src/schemas/book-schema.ts`                     | 編集 |
| `packages/shared/src/schemas/books-api-schema.ts`                | 編集 |
| `packages/shared/src/types/book.ts`                              | 編集 |
| `packages/shared/src/store/deep-link.ts`                         | 新規 |
| `packages/shared/src/store/__tests__/deep-link.test.ts`          | 新規 |
| `packages/shared/src/index.ts`                                   | 編集 |
| `packages/shared/src/schemas/__tests__/book-schema.test.ts`      | 編集 |
| `packages/shared/src/schemas/__tests__/books-api-schema.test.ts` | 編集 |
| `apps/extension/src/content/kindle.ts`                           | 編集 |
| `apps/extension/src/content/shared/parser.ts`                    | 編集 |
| `apps/extension/src/content/__tests__/kindle.test.ts`            | 編集 |
| `apps/extension/src/content/shared/__tests__/parser.test.ts`     | 編集 |
| `supabase/migrations/20260418XXXXXX_books_store_product_id.sql`  | 新規 |
| `docs/specs/DB_SCHEMA.md`                                        | 編集 |
| `apps/web/lib/books/book-repository.ts`                          | 編集 |
| `apps/web/lib/scrape/process-scrape.ts`                          | 編集 |
| `apps/web/lib/books/get-user-books.ts`                           | 編集 |
| `apps/web/lib/books/__tests__/get-user-books.test.ts`            | 編集 |
