-- ============================================================
-- Migration: books テーブルの UNIQUE 制約を部分インデックスに変更
--
-- 変更理由:
--   UNIQUE (title, author, volume_number) では NULL 同士が衝突しないため、
--   同じ単巻作品（volume_number IS NULL）を何件でも登録できてしまう。
--   共有マスタが分裂すると user_books.book_id が別レコードに散り、
--   二度買い判定が崩れるため、部分ユニークインデックスで対応する。
-- ============================================================

-- 既存の UNIQUE 制約を削除
ALTER TABLE public.books
  DROP CONSTRAINT IF EXISTS books_title_author_volume_unique;

-- 単巻作品（volume_number IS NULL）: title + author で一意
CREATE UNIQUE INDEX IF NOT EXISTS books_single_volume_unique
  ON public.books (title, author)
  WHERE volume_number IS NULL;

-- 複数巻作品（volume_number IS NOT NULL）: title + author + volume_number で一意
CREATE UNIQUE INDEX IF NOT EXISTS books_multi_volume_unique
  ON public.books (title, author, volume_number)
  WHERE volume_number IS NOT NULL;

-- カラムコメント更新
COMMENT ON COLUMN public.books.volume_number IS '巻数。単巻・一話完結は NULL。部分ユニークインデックスで NULL 同士の重複を防ぐ。';
