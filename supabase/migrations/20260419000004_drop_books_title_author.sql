-- ============================================================
-- Migration: books.title / books.author を DROP して series 正規化を完了
--
-- 背景:
--   #31 で series テーブルを導入し books.series_id を NOT NULL FK 化した。
--   books.title / books.author は series.title / series.author と完全な重複
--   コピー状態で dead weight になっていた。
--   books の UNIQUE 制約は既に (series_id, volume_number) ベースに置換済で
--   title/author を参照するインデックスも役割を失っている。
--
-- 変更内容:
--   1. idx_books_title / idx_books_title_author を DROP
--   2. upsert_book_with_series RPC を INSERT from title/author を除いた
--      新しい body で CREATE OR REPLACE (署名は不変)
--   3. books.title / books.author を DROP COLUMN
--
-- 影響:
--   - RPC 署名 (p_title, p_author 引数) は維持。series upsert に使用する。
--   - books 行型 (public.books) は ALTER TABLE 後に自動的に title/author を
--     失い、RPC の RETURNS public.books は新しい形で透過的に動く。
-- ============================================================

-- ============================================================
-- Step 1: 旧 (title, author) ベースのインデックス削除
-- ============================================================
DROP INDEX IF EXISTS public.idx_books_title;
DROP INDEX IF EXISTS public.idx_books_title_author;

-- ============================================================
-- Step 2: RPC を title/author を books に書き込まない形に置換
--   順序が重要: DROP COLUMN 前に RPC body から title/author 参照を除かないと
--   依存検出で失敗する可能性がある。
--
--   注: この時点の body にある `ON CONFLICT (title, author) DO UPDATE SET
--   title = EXCLUDED.title` は series の UPDATE RLS ポリシー USING(false) と
--   衝突して実行時 403 になる既知バグを持つ。本マイグレーション適用後、
--   20260419000006_fix_rpc_on_conflict_update.sql で DO NOTHING + SELECT
--   fallback に修正される。
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_book_with_series(
  p_title            text,
  p_author           text,
  p_volume_number    integer,
  p_thumbnail_url    text,
  p_isbn             text,
  p_published_at     date,
  p_is_adult         boolean,
  p_store_product_id text
)
RETURNS public.books
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_series_id uuid;
  v_book      public.books;
BEGIN
  -- series を upsert して id を取得。p_title / p_author は series の識別子
  -- としてのみ使用する (books には書き込まない)。
  INSERT INTO public.series (title, author)
  VALUES (p_title, p_author)
  ON CONFLICT (title, author) DO UPDATE SET title = EXCLUDED.title
  RETURNING id INTO v_series_id;

  -- books を insert。title / author は series から参照するため保持しない。
  INSERT INTO public.books (
    series_id, volume_number,
    thumbnail_url, isbn, published_at, is_adult, store_product_id
  )
  VALUES (
    v_series_id, p_volume_number,
    p_thumbnail_url, p_isbn, p_published_at, COALESCE(p_is_adult, false), p_store_product_id
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_book;

  IF v_book.id IS NULL THEN
    SELECT * INTO v_book
    FROM public.books
    WHERE series_id = v_series_id
      AND volume_number IS NOT DISTINCT FROM p_volume_number
    LIMIT 1;
  END IF;

  RETURN v_book;
END;
$$;

-- ============================================================
-- Step 3: books.title / books.author を DROP
--   series から JOIN 参照するため books 側の重複カラムを除去する。
-- ============================================================
ALTER TABLE public.books
  DROP COLUMN title,
  DROP COLUMN author;

-- ============================================================
-- Rollback runbook (Supabase は down migration を管理しないため手動実行):
--
--   -- カラム復活 + バックフィル
--   ALTER TABLE public.books ADD COLUMN title text, ADD COLUMN author text;
--   UPDATE public.books b SET title = s.title, author = s.author
--     FROM public.series s WHERE b.series_id = s.id;
--   ALTER TABLE public.books ALTER COLUMN title SET NOT NULL, ALTER COLUMN author SET NOT NULL;
--
--   -- 旧インデックス復活
--   CREATE INDEX idx_books_title_author ON public.books (title, author);
--   CREATE INDEX idx_books_title        ON public.books (title);
--
--   -- RPC を旧 body (books.title / books.author 書き込み版) に戻す
--   (20260419000002_upsert_book_with_series_rpc.sql の body を再適用)
-- ============================================================
