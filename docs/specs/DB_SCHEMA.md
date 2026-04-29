# Database Schema

BookHub の Supabase PostgreSQL スキーマ定義。全テーブルは Row Level Security (RLS) で保護されています。

---

## Table of Contents

1. [profiles](#profiles-ユーザープロフィール)
2. [series](#series-シリーズマスタ)
3. [books](#books-書籍マスタ)
4. [user_books](#user_books-ユーザー所持情報)
5. [user_series_view](#user_series_viewシリーズ集約ビュー)
6. [Migration History](#migration-history)
7. [Row Level Security (RLS)](#row-level-security)
8. [Query Examples](#query-examples)

---

## profiles（ユーザープロフィール）

Supabase Auth (`auth.users`) と 1:1 対応するユーザープロフィール。認証ユーザーの作成時に自動作成されます。

### スキーマ

| カラム         | 型          | 制約                                        | 説明                             |
| -------------- | ----------- | ------------------------------------------- | -------------------------------- |
| `id`           | uuid        | PK, FK → `auth.users(id)` ON DELETE CASCADE | ユーザーID（Supabase Auth 由来） |
| `display_name` | text        | NULL可                                      | 表示用ユーザー名                 |
| `avatar_url`   | text        | NULL可                                      | アバター画像 URL                 |
| `created_at`   | timestamptz | NOT NULL, DEFAULT now()                     | 作成日時                         |

### インデックス

なし（PK のみ）

### RLS ポリシー

- **SELECT**: 自分のレコードのみ (`auth.uid() = id`)
- **UPDATE**: 自分のレコードのみ (`auth.uid() = id`)
- **INSERT/DELETE**: ポリシーなし（トリガーで自動作成・削除）

### トリガー

**`on_auth_user_created`**  
`auth.users` へのユーザー作成時に自動的に `profiles` レコードを作成します。

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger AS $$
  BEGIN
    INSERT INTO public.profiles (id) VALUES (NEW.id);
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## series（シリーズマスタ）

全ユーザー共有のシリーズマスタ。**1 レコード = 1 シリーズ** を表します。`books` が `series_id` で参照する正規化された親テーブルです。

### 背景

当初は `books.(title, author)` でシリーズを識別していましたが、以下のためシリーズを切り出しました:

- シリーズ単位のメタ情報（完結フラグ、次巻予定日、`is_adult` のシリーズ昇格等）を保持する素地が必要
- シリーズ一覧 → 巻詳細の二階層 UI（別 issue）の前提

### スキーマ

| カラム       | 型          | 制約                          | 説明                                                                  |
| ------------ | ----------- | ----------------------------- | --------------------------------------------------------------------- |
| `id`         | uuid        | PK, DEFAULT gen_random_uuid() | シリーズ ID                                                           |
| `title`      | text        | NOT NULL                      | シリーズタイトル（巻番号を除いたもの）。`extractSeriesTitle` 正規化済 |
| `author`     | text        | NOT NULL                      | シリーズ著者名                                                        |
| `created_at` | timestamptz | NOT NULL, DEFAULT now()       | 作成日時                                                              |

### 制約

| 制約名                       | 種別   | 条件            | 用途                   |
| ---------------------------- | ------ | --------------- | ---------------------- |
| `series_title_author_unique` | UNIQUE | (title, author) | 同一シリーズの重複防止 |

### インデックス

| インデックス                 | カラム                | 種別                 | 用途                                                               |
| ---------------------------- | --------------------- | -------------------- | ------------------------------------------------------------------ |
| `series_title_author_unique` | (title, author)       | UNIQUE B-tree (制約) | 同一シリーズ重複防止 + prefix 一致検索                             |
| `idx_series_title_trgm`      | title (gin_trgm_ops)  | GIN (pg_trgm)        | `title ILIKE '%foo%'` の中間一致検索 (`/bookshelf` シリーズ検索用) |
| `idx_series_author_trgm`     | author (gin_trgm_ops) | GIN (pg_trgm)        | `author ILIKE '%foo%'` の中間一致検索                              |

**背景**: pg_trgm の GIN インデックスは ILIKE の中間一致 (`%foo%`) に対応するため、シリーズ件数が増加してもシリーズ検索のレイテンシを抑えられる。書き込みコストはやや増えるが、series の INSERT は scrape 時のみで低頻度のため許容。

### RLS ポリシー

- **SELECT**: 認証済みユーザーは全件参照可 (`auth.role() = 'authenticated'`)
- **INSERT**: 認証済みユーザーが追加可 (`auth.role() = 'authenticated'`)
- **UPDATE**: 明示的に拒否 (`USING (false)`)
- **DELETE**: 明示的に拒否 (`USING (false)`)

---

## books（書籍マスタ）

全ユーザー共有の書籍マスタ。**1 レコード = 1 冊（巻）** を表します。

### 背景

当初は `books` と `book_volumes` を別テーブルとしていましたが、以下の理由から統合：

- ユーザーが複数ストアで巻ごとに異なる購入をする場合（例: 1〜4巻 Kindle / 5巻 DMM）に対応
- 巻ごとに異なる表紙画像（サムネイル）を保持

### スキーマ

| カラム             | 型          | 制約                                           | 説明                                                                              |
| ------------------ | ----------- | ---------------------------------------------- | --------------------------------------------------------------------------------- |
| `id`               | uuid        | PK, DEFAULT gen_random_uuid()                  | 書籍 ID                                                                           |
| `series_id`        | uuid        | NOT NULL, FK → `series(id)` ON DELETE RESTRICT | シリーズ ID。タイトル・著者は `series` を JOIN して取得する                       |
| `volume_number`    | integer     | NULL可                                         | 巻数。NULL = 単巻・一話完結作品。部分ユニークインデックスで NULL 同士の重複を防ぐ |
| `thumbnail_url`    | text        | NULL可                                         | 表紙画像 URL（巻ごとに異なる可能性あり）                                          |
| `isbn`             | text        | NULL可                                         | ISBN コード                                                                       |
| `published_at`     | date        | NULL可                                         | 出版日                                                                            |
| `is_adult`         | boolean     | NOT NULL, DEFAULT false                        | 成人向けフラグ（true の場合は本棚分離）                                           |
| `store_product_id` | text        | NULL可                                         | ストア固有の商品ID（例: Amazon ASIN, DMM コンテンツID）。deep link 派生に使用     |
| `created_at`       | timestamptz | NOT NULL, DEFAULT now()                        | 作成日時                                                                          |

### 制約

| 制約名                          | 種別  | 条件                                                                      | 用途                                                            |
| ------------------------------- | ----- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `books_store_product_id_format` | CHECK | `store_product_id IS NULL OR store_product_id ~ '^[A-Za-z0-9_.-]{1,64}$'` | アプリ層の Zod バリデーションと同等の文字種制限を DB 側でも強制 |
| `books_series_id_fk`            | FK    | `series_id REFERENCES series(id) ON DELETE RESTRICT`                      | 参照整合性。参照中の series は削除不可                          |

その他の重複防止は部分ユニークインデックスで実装（下記）。

### インデックス

| インデックス                        | カラム                     | 条件                               | 用途                                   |
| ----------------------------------- | -------------------------- | ---------------------------------- | -------------------------------------- |
| `books_series_single_volume_unique` | (series_id)                | WHERE volume_number IS NULL        | 単巻作品の重複登録防止                 |
| `books_series_multi_volume_unique`  | (series_id, volume_number) | WHERE volume_number IS NOT NULL    | 複数巻作品の巻ごとの重複登録防止       |
| `books_store_product_id_idx`        | (store_product_id)         | WHERE store_product_id IS NOT NULL | ストア商品ID からの逆引き（deep link） |

**背景**: PostgreSQL の UNIQUE 制約では `NULL = NULL` が偽なので、`volume_number IS NULL` の単巻作品を何件でも登録できてしまいます。部分ユニークインデックスを使用することで、単巻作品の重複を確実に防ぎます。`(series_id)` / `(series_id, volume_number)` が B-tree 索引を兼ねるため、追加の単独 `series_id` インデックスは不要です。タイトル・著者の検索 (LIKE) は `series` 側のインデックスを使う想定です。

### RLS ポリシー

- **SELECT**: 認証済みユーザーは全件参照可 (`auth.role() = 'authenticated'`)
- **INSERT**: 認証済みユーザーが追加可 (`auth.role() = 'authenticated'`)
- **UPDATE/DELETE**: ポリシーなし（読み込みのみ想定）

---

## user_books（ユーザー所持情報）

ユーザーが購入・所持している書籍記録。1 レコード = **1 巻 × 1 ストア** の購入を表します。

### スキーマ

| カラム       | 型          | 制約                                            | 説明                                  |
| ------------ | ----------- | ----------------------------------------------- | ------------------------------------- |
| `id`         | uuid        | PK, DEFAULT gen_random_uuid()                   | レコード ID                           |
| `user_id`    | uuid        | NOT NULL, FK → `profiles(id)` ON DELETE CASCADE | ユーザー ID                           |
| `book_id`    | uuid        | NOT NULL, FK → `books(id)` ON DELETE CASCADE    | 書籍 ID（books テーブルへの外部キー） |
| `store`      | text        | NOT NULL, CHECK IN ('kindle', 'dmm', 'other')   | 購入ストア                            |
| `created_at` | timestamptz | NOT NULL, DEFAULT now()                         | 購入日時（登録日）                    |
| `updated_at` | timestamptz | NOT NULL, DEFAULT now()                         | 更新日時（自動更新）                  |

### 制約

- **`user_books_user_book_store_unique`**: UNIQUE (user_id, book_id, store)  
  同一ユーザー・同一巻・同一ストアの重複登録を防止。これにより、ユーザーが同じ巻を異なるストアで複数購入することは可能です。

### インデックス

| インデックス                     | カラム             | 用途                       |
| -------------------------------- | ------------------ | -------------------------- |
| `idx_user_books_user_id`         | (user_id)          | ユーザーの全購入巻検索     |
| `idx_user_books_user_id_book_id` | (user_id, book_id) | 特定シリーズの所持状況検索 |

### RLS ポリシー

- **SELECT**: 自分のレコードのみ (`auth.uid() = user_id`)
- **INSERT**: 自分のレコードのみ (`auth.uid() = user_id`)
- **UPDATE**: 自分のレコードのみ (`auth.uid() = user_id`)
- **DELETE**: 自分のレコードのみ (`auth.uid() = user_id`)

### トリガー

**`user_books_updated_at`**  
UPDATE 操作時に `updated_at` を自動的に現在時刻に更新します。

```sql
CREATE TRIGGER user_books_updated_at
  BEFORE UPDATE ON public.user_books
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);
```

使用拡張: `moddatetime` (PostgreSQL 公式拡張)

---

## user_series_view（シリーズ集約ビュー）

`/bookshelf` のシリーズ一覧表示用のビュー。`user_books → books → series` を JOIN し、ユーザー × シリーズ単位で集約する。

### 背景

シリーズ単位の本棚 UI（Issue #33）で「最小巻表紙 + 巻数バッジ + 所有ストア集合」を `count: 'exact'` でページング可能な形で取得するために導入。アプリ層 (JS) で集約する案も検討したが、行数上限による silently truncate のリスクがあるため view を採用。

### 定義

下記は要旨。`cover_thumbnail_url` と `stores` の correlated subquery 実装は省略しているため、完全な定義は migration ファイル `supabase/migrations/20260420000001_user_series_view.sql` を参照すること。

```sql
CREATE OR REPLACE VIEW public.user_series_view
WITH (security_invoker = on)
AS
SELECT
  ub.user_id,
  s.id AS series_id,
  s.title,
  s.author,
  COUNT(DISTINCT b.id)::int AS volume_count,
  ( /* 最小 volume_number で thumbnail_url が NOT NULL の最初の巻 — 詳細は migration 参照 */ ) AS cover_thumbnail_url,
  ARRAY( /* DISTINCT + ORDER BY store でソート安定 — 詳細は migration 参照 */ ) AS stores,
  MAX(ub.created_at) AS last_added_at
FROM public.user_books ub
JOIN public.books   b ON b.id = ub.book_id
JOIN public.series  s ON s.id = b.series_id
GROUP BY ub.user_id, s.id, s.title, s.author;

GRANT SELECT ON public.user_series_view TO authenticated;
```

### カラム

| カラム                | 型           | 説明                                                                                |
| --------------------- | ------------ | ----------------------------------------------------------------------------------- |
| `user_id`             | uuid         | 所有ユーザー (`user_books.user_id` 由来)                                            |
| `series_id`           | uuid         | シリーズ ID (`series.id`)                                                           |
| `title`               | text         | シリーズタイトル                                                                    |
| `author`              | text         | シリーズ著者                                                                        |
| `volume_count`        | int          | ユーザー所有の distinct book 数                                                     |
| `cover_thumbnail_url` | text \| null | 最小 `volume_number` で `thumbnail_url IS NOT NULL` の巻のサムネイル。無ければ null |
| `stores`              | text[]       | 所有 user_books の distinct ストア集合 (sort 済)                                    |
| `last_added_at`       | timestamptz  | `MAX(user_books.created_at)`。最近追加順ソートのための予備                          |

### セキュリティ

- `WITH (security_invoker = on)` 指定により、view 経由 SELECT には呼出ユーザーの RLS が適用される
- 内部の `user_books` テーブルが `auth.uid() = user_id` ポリシーを持つため、自分の行のみが集約に含まれる
- アプリ層 (PostgREST) でも defense in depth として `.eq('user_id', userId)` を明示する規約

### 用途

- `apps/web/lib/books/get-user-series.ts` から `from('user_series_view').select(...)` で利用
- ILIKE 検索 (`title.ilike` / `author.ilike`) は view 列に直接適用可能

---

## Migration History

| Version          | Name                           | Applied | 説明                                                                 |
| ---------------- | ------------------------------ | ------- | -------------------------------------------------------------------- |
| `20260410135910` | `create_initial_schema`        | ✓       | 初期スキーマ（books, book_volumes, user_books, profiles）            |
| `20260411000000` | `restructure_books_schema`     | ✓       | book_volumes を books に統合、max_volume_owned 削除                  |
| `20260411000001` | `fix_rls_policies`             | ✓       | RLS ポリシーのセキュリティ修正                                       |
| `20260411000002` | `fix_books_unique_constraint`  | ✓       | books テーブルの UNIQUE 制約を部分インデックスに変更                 |
| `20260418000000` | `books_store_product_id`       | ✓       | `books.store_product_id` カラム追加 (ASIN / DMM コンテンツID 永続化) |
| `20260419000000` | `books_store_product_id_check` | ✓       | `store_product_id` に文字種 CHECK 制約を追加 (defense in depth)      |
| `20260419000001` | `introduce_series`             | ✓       | `series` テーブル導入 + `books.series_id` バックフィル + UNIQUE 更新 |
| `20260419000002` | `upsert_book_with_series_rpc`  | ✓       | `upsert_book_with_series` RPC (series + books を atomic に登録)      |
| `20260419000003` | `backfill_parser_fix`          | ✓       | parser 相当 SQL で既存 books を再解析、series 再バックフィル         |
| `20260419000004` | `drop_books_title_author`      | ✓       | `books.title` / `books.author` を DROP (series 正規化完了)           |
| `20260419000005` | `cleanup_post_parser_fix`      | ✓       | parser 修正後に流入した汚染 series 行を再正規化                      |
| `20260419000006` | `fix_rpc_on_conflict_update`   | ✓       | `upsert_book_with_series` の series UPSERT を `DO NOTHING` に修正    |
| `20260420000001` | `user_series_view`             | ✓       | `user_series_view` ビュー導入（シリーズ単位本棚の集約クエリ用）      |
| `20260420000002` | `series_trgm_indexes`          | ✓       | `series.title` / `series.author` に pg_trgm GIN インデックス追加     |

---

## Row Level Security (RLS)

全テーブルで RLS が有効化されています。RLS の目的は、ユーザーが自分のデータのみアクセス可能に制限することです。

### ポリシー全体図

```
┌─────────────────────────────────────────────────────────────┐
│                         profiles                             │
│  - SELECT: auth.uid() = id    （自分のみ）                  │
│  - UPDATE: auth.uid() = id    （自分のみ）                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                         series                               │
│  - SELECT: auth.role() = 'authenticated'  （全ユーザー読み取り）│
│  - INSERT: auth.role() = 'authenticated'  （全ユーザー追加）    │
│  - UPDATE/DELETE: USING (false)  （明示的に拒否）              │
│  （共有マスタデータ）                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                          books                               │
│  - SELECT: auth.role() = 'authenticated'  （全ユーザー読み取り）│
│  - INSERT: auth.role() = 'authenticated'  （全ユーザー追加）    │
│  - UPDATE/DELETE: USING (false)  （明示的に拒否）              │
│  （共有マスタデータ）                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                       user_books                             │
│  - SELECT: auth.uid() = user_id   （自分のみ）              │
│  - INSERT: auth.uid() = user_id   （自分のみ）              │
│  - UPDATE: auth.uid() = user_id   （自分のみ）              │
│  - DELETE: auth.uid() = user_id   （自分のみ）              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  user_series_view (VIEW)                     │
│  - security_invoker = on                                     │
│  - 内部の user_books の RLS が呼出ユーザーに対して効く        │
│  - GRANT SELECT TO authenticated                             │
└─────────────────────────────────────────────────────────────┘
```

### セキュリティ考慮事項

- `profiles` は自分のレコードのみ UPDATE 可能。削除はできません（ユーザー削除時に `auth.users` ON DELETE CASCADE で自動削除）
- `books` は全ユーザーが追加可能。悪意あるユーザーがゴミデータを投入できるため、フェーズ2以降に管理者審査フローの実装を検討
- `user_books` は自分の所持情報のみ CRUD 可能。他ユーザーの購入履歴は閲覧・編集できません

---

## Query Examples

### ユーザーの全所持巻（本棚表示）

```sql
SELECT b.*, s.title, s.author, ub.store, ub.created_at AS added_at
FROM user_books ub
JOIN books b  ON b.id = ub.book_id
JOIN series s ON s.id = b.series_id
WHERE ub.user_id = $1
ORDER BY s.title, b.volume_number;
```

### シリーズ別まとめ（次巻ステータス表示）

```sql
SELECT
  s.id AS series_id,
  s.title,
  s.author,
  COUNT(DISTINCT CASE WHEN b.volume_number IS NOT NULL THEN b.volume_number END) AS owned_count,
  MAX(b.volume_number) AS max_owned_volume,
  STRING_AGG(DISTINCT ub.store, ', ' ORDER BY ub.store) AS stores
FROM user_books ub
JOIN books b  ON b.id = ub.book_id
JOIN series s ON s.id = b.series_id
WHERE ub.user_id = $1
GROUP BY s.id, s.title, s.author
ORDER BY s.title;
```

### シリーズ単位本棚（`user_series_view` 経由・PostgREST から利用）

`/bookshelf` (Issue #33) で `count: 'exact'` ページング + ILIKE 検索を 1 query で。

```sql
-- raw SQL 等価
SELECT series_id, title, author, volume_count, cover_thumbnail_url, stores, last_added_at
FROM public.user_series_view
WHERE user_id = $1
  AND (title ILIKE $2 OR author ILIKE $2)  -- $2 例: '%ワンピ%'
ORDER BY title
LIMIT $3 OFFSET $4;
```

PostgREST 経由:

```ts
supabase
  .from('user_series_view')
  .select('series_id, title, author, volume_count, cover_thumbnail_url, stores, last_added_at', {
    count: 'exact',
  })
  .eq('user_id', userId)
  .or(`title.ilike.${pattern},author.ilike.${pattern}`)
  .order('title')
  .range(offset, offset + limit - 1)
```

### 二度買い防止チェック

```sql
SELECT ub.store, ub.created_at
FROM user_books ub
JOIN books b  ON b.id = ub.book_id
JOIN series s ON s.id = b.series_id
WHERE s.title = $1
  AND b.volume_number = $2
  AND ub.user_id = $3;
```

**用途**: Chrome 拡張がストアページで検出した書籍がユーザーの本棚に既に存在するか確認

### ストア別集計

```sql
SELECT
  ub.store,
  COUNT(DISTINCT b.id) AS unique_books,
  COUNT(*) AS total_volumes
FROM user_books ub
JOIN books b ON b.id = ub.book_id
WHERE ub.user_id = $1
GROUP BY ub.store;
```

---

## Supabase での確認方法

### テーブル構造の確認

Supabase ダッシュボード → **SQL Editor** → 以下を実行：

```sql
-- テーブル定義確認
\d public.books
\d public.user_books
\d public.profiles

-- インデックス確認
SELECT tablename, indexname FROM pg_indexes WHERE tablename IN ('books', 'user_books', 'profiles');

-- RLS ポリシー確認
SELECT tablename, policyname FROM pg_policies WHERE tablename IN ('books', 'user_books', 'profiles');
```

### サンプルデータ確認

```sql
-- 登録済み書籍
SELECT * FROM books LIMIT 10;

-- user_books レコード数（認証ユーザーのみ参照可）
SELECT COUNT(*) FROM user_books;
```

---

## フェーズ2 以降での検討事項

| 検討項目                   | 理由                                            | 優先度 |
| -------------------------- | ----------------------------------------------- | ------ |
| `authors` テーブル分割     | 著者プロフィール、複数著者対応                  | Low    |
| `series` メタ情報拡張      | 完結フラグ、次巻予定日、is_adult のシリーズ昇格 | Medium |
| 全文検索インデックス       | 大文字小文字非対応の LIKE 検索改善              | Medium |
| books の管理者審査フロー   | 品質管理、スパムデータ削減                      | Medium |
| ソフトデリート（論理削除） | 削除履歴の監査                                  | Low    |
