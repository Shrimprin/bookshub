# Database Schema

BookHub の Supabase PostgreSQL スキーマ定義。全テーブルは Row Level Security (RLS) で保護されています。

---

## Table of Contents

1. [profiles](#profiles-ユーザープロフィール)
2. [books](#books-書籍マスタ)
3. [user_books](#user_books-ユーザー所持情報)
4. [Migration History](#migration-history)
5. [Row Level Security (RLS)](#row-level-security)
6. [Query Examples](#query-examples)

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

## books（書籍マスタ）

全ユーザー共有の書籍マスタ。**1 レコード = 1 冊（巻）** を表します。

### 背景

当初は `books` と `book_volumes` を別テーブルとしていましたが、以下の理由から統合：

- ユーザーが複数ストアで巻ごとに異なる購入をする場合（例: 1〜4巻 Kindle / 5巻 DMM）に対応
- 巻ごとに異なる表紙画像（サムネイル）を保持

### スキーマ

| カラム             | 型          | 制約                          | 説明                                                                              |
| ------------------ | ----------- | ----------------------------- | --------------------------------------------------------------------------------- |
| `id`               | uuid        | PK, DEFAULT gen_random_uuid() | 書籍 ID                                                                           |
| `title`            | text        | NOT NULL                      | 作品タイトル                                                                      |
| `author`           | text        | NOT NULL                      | 著者名                                                                            |
| `volume_number`    | integer     | NULL可                        | 巻数。NULL = 単巻・一話完結作品。部分ユニークインデックスで NULL 同士の重複を防ぐ |
| `thumbnail_url`    | text        | NULL可                        | 表紙画像 URL（巻ごとに異なる可能性あり）                                          |
| `isbn`             | text        | NULL可                        | ISBN コード                                                                       |
| `published_at`     | date        | NULL可                        | 出版日                                                                            |
| `is_adult`         | boolean     | NOT NULL, DEFAULT false       | 成人向けフラグ（true の場合は本棚分離）                                           |
| `store_product_id` | text        | NULL可                        | ストア固有の商品ID（例: Amazon ASIN, DMM コンテンツID）。deep link 派生に使用     |
| `created_at`       | timestamptz | NOT NULL, DEFAULT now()       | 作成日時                                                                          |

### 制約

| 制約名                          | 種別  | 条件                                                                      | 用途                                                            |
| ------------------------------- | ----- | ------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `books_store_product_id_format` | CHECK | `store_product_id IS NULL OR store_product_id ~ '^[A-Za-z0-9_.-]{1,64}$'` | アプリ層の Zod バリデーションと同等の文字種制限を DB 側でも強制 |

その他の重複防止は部分ユニークインデックスで実装（下記）。

### インデックス

| インデックス                 | カラム                         | 条件                               | 用途                                   |
| ---------------------------- | ------------------------------ | ---------------------------------- | -------------------------------------- |
| `books_single_volume_unique` | (title, author)                | WHERE volume_number IS NULL        | 単巻作品の重複登録防止                 |
| `books_multi_volume_unique`  | (title, author, volume_number) | WHERE volume_number IS NOT NULL    | 複数巻作品の巻ごとの重複登録防止       |
| `idx_books_title_author`     | (title, author)                | —                                  | シリーズ単位の検索                     |
| `idx_books_title`            | (title)                        | —                                  | タイトル検索（LIKE %）                 |
| `books_store_product_id_idx` | (store_product_id)             | WHERE store_product_id IS NOT NULL | ストア商品ID からの逆引き（deep link） |

**背景**: PostgreSQL の UNIQUE 制約では `NULL = NULL` が偽なので、`volume_number IS NULL` の単巻作品を何件でも登録できてしまいます。部分ユニークインデックスを使用することで、単巻作品の重複を確実に防ぎます。

**注**: 大文字小文字非対応の LIKE 検索に対応するには、`pg_trgm` 拡張と GIN インデックスを検討（フェーズ2以降）。

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

## Migration History

| Version          | Name                           | Applied | 説明                                                                 |
| ---------------- | ------------------------------ | ------- | -------------------------------------------------------------------- |
| `20260410135910` | `create_initial_schema`        | ✓       | 初期スキーマ（books, book_volumes, user_books, profiles）            |
| `20260411000000` | `restructure_books_schema`     | ✓       | book_volumes を books に統合、max_volume_owned 削除                  |
| `20260411000001` | `fix_rls_policies`             | ✓       | RLS ポリシーのセキュリティ修正                                       |
| `20260411000002` | `fix_books_unique_constraint`  | ✓       | books テーブルの UNIQUE 制約を部分インデックスに変更                 |
| `20260418000000` | `books_store_product_id`       | ✓       | `books.store_product_id` カラム追加 (ASIN / DMM コンテンツID 永続化) |
| `20260419000000` | `books_store_product_id_check` | ✓       | `store_product_id` に文字種 CHECK 制約を追加 (defense in depth)      |

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
│                          books                               │
│  - SELECT: auth.role() = 'authenticated'  （全ユーザー読み取り）│
│  - INSERT: auth.role() = 'authenticated'  （全ユーザー追加）    │
│  （共有マスタデータ）                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                       user_books                             │
│  - SELECT: auth.uid() = user_id   （自分のみ）              │
│  - INSERT: auth.uid() = user_id   （自分のみ）              │
│  - UPDATE: auth.uid() = user_id   （自分のみ）              │
│  - DELETE: auth.uid() = user_id   （自分のみ）              │
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
SELECT b.*, ub.store, ub.created_at AS added_at
FROM user_books ub
JOIN books b ON b.id = ub.book_id
WHERE ub.user_id = $1
ORDER BY b.title, b.volume_number;
```

### シリーズ別まとめ（次巻ステータス表示）

```sql
SELECT
  b.title,
  b.author,
  COUNT(DISTINCT CASE WHEN b.volume_number IS NOT NULL THEN b.volume_number END) AS owned_count,
  MAX(b.volume_number) AS max_owned_volume,
  STRING_AGG(DISTINCT ub.store, ', ' ORDER BY ub.store) AS stores
FROM user_books ub
JOIN books b ON b.id = ub.book_id
WHERE ub.user_id = $1
GROUP BY b.title, b.author
ORDER BY b.title;
```

### 二度買い防止チェック

```sql
SELECT ub.store, ub.created_at
FROM user_books ub
JOIN books b ON b.id = ub.book_id
WHERE b.title = $1
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

| 検討項目                   | 理由                                   | 優先度 |
| -------------------------- | -------------------------------------- | ------ |
| `authors` テーブル分割     | 著者プロフィール、複数著者対応         | Low    |
| `series` テーブル分割      | シリーズメタデータ（完結フラグ等）管理 | Low    |
| 全文検索インデックス       | 大文字小文字非対応の LIKE 検索改善     | Medium |
| books の管理者審査フロー   | 品質管理、スパムデータ削減             | Medium |
| ソフトデリート（論理削除） | 削除履歴の監査                         | Low    |
