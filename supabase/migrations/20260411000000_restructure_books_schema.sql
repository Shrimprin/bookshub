-- ============================================================
-- Migration: books + book_volumes を統合
--
-- 変更理由:
--   1. user_books が max_volume_owned でストア横断の巻管理ができない問題を解消
--      （例: 1〜4巻 Kindle / 5巻 DMM という購入パターンに非対応）
--   2. thumbnail_url が作品レベルにしかなく、巻ごとのサムネイル表示に非対応
-- 変更内容:
--   - books テーブルを「1 record = 1 購入可能な巻」として再定義
--   - book_volumes テーブルを廃止（books へ統合）
--   - user_books の max_volume_owned カラムを削除
-- ============================================================

-- ============================================================
-- Step 1: 旧テーブルを DROP（依存するポリシー・インデックスも含む）
-- ============================================================

-- user_books は book_id（旧 books への FK）を持つため先に DROP
DROP TABLE IF EXISTS public.user_books;
DROP TABLE IF EXISTS public.book_volumes;
DROP TABLE IF EXISTS public.books;

-- ============================================================
-- Step 2: 新 books テーブル（1 record = 1 購入可能な巻）
-- ============================================================
CREATE TABLE public.books (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text        NOT NULL,
  author        text        NOT NULL,
  volume_number integer,                       -- NULL = 単巻・一話完結作品
  thumbnail_url text,
  isbn          text,
  published_at  date,
  is_adult      boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT books_title_author_volume_unique UNIQUE (title, author, volume_number)
);

COMMENT ON TABLE  public.books               IS '書籍マスタ（全ユーザー共有）。1 レコードが 1 冊（巻）を表す。';
COMMENT ON COLUMN public.books.volume_number IS '巻数。単巻・一話完結は NULL。UNIQUE 制約では NULL は重複とみなされない。';
COMMENT ON COLUMN public.books.is_adult      IS '成人向けコンテンツフラグ。true の場合は本棚を分離して表示する。';

-- ============================================================
-- Step 3: 新 user_books テーブル（max_volume_owned を削除）
-- ============================================================
CREATE TABLE public.user_books (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id      uuid        NOT NULL REFERENCES public.books(id)    ON DELETE CASCADE,
  store        text        NOT NULL CHECK (store IN ('kindle', 'dmm', 'other')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_books_user_book_store_unique UNIQUE (user_id, book_id, store)
);

COMMENT ON TABLE  public.user_books       IS 'ユーザーの所持情報。1 レコードが「1 巻 × 1 ストア」の購入を表す。二度買い防止アラートに使用する。';
COMMENT ON COLUMN public.user_books.store IS '購入ストア: kindle / dmm / other';

-- ============================================================
-- Step 4: インデックス
-- ============================================================
CREATE INDEX idx_user_books_user_id         ON public.user_books (user_id);
CREATE INDEX idx_user_books_user_id_book_id ON public.user_books (user_id, book_id);
CREATE INDEX idx_books_title_author         ON public.books (title, author);
CREATE INDEX idx_books_title                ON public.books (title);

-- ============================================================
-- Step 5: Row Level Security
-- ============================================================
ALTER TABLE public.books      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_books ENABLE ROW LEVEL SECURITY;

-- books: 認証済みユーザーは全件参照・追加可（共有マスタ）
CREATE POLICY "books: 認証ユーザーが参照可" ON public.books
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "books: 認証ユーザーが追加可" ON public.books
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- user_books: 自分の所持情報のみ CRUD 可
CREATE POLICY "user_books: 自分のレコードを参照" ON public.user_books
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_books: 自分のレコードを追加" ON public.user_books
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_books: 自分のレコードを更新" ON public.user_books
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_books: 自分のレコードを削除" ON public.user_books
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Step 6: Trigger: user_books.updated_at 自動更新
-- ============================================================
CREATE TRIGGER user_books_updated_at
  BEFORE UPDATE ON public.user_books
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);
