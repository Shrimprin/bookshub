-- ============================================================
-- Migration: upsert_book_with_series RPC (series + books を atomic に登録)
--
-- 背景:
--   クライアント (Supabase JS) から「series を upsert → books を insert」を
--   2 リクエストで行うと、前者成功・後者失敗時に orphan series が残る。
--   書籍登録は scrape と手動登録の両経路で同じ処理が走り、本数が多いため
--   1 トランザクション化と往復削減が必要。
--
--   `upsert_book_with_series` 関数で以下を atomic に実行する:
--     1. series を upsert して series_id を取得
--     2. books を insert (既存は取得して返す)
--     3. books の全カラムを返す
--
--   `SECURITY INVOKER` で RLS (認証ユーザーのみ書き込み可) は引き続き効く。
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
  -- Step 1: series を upsert して id を取得。
  --   ON CONFLICT DO UPDATE に「変化なしの dummy SET」を書くのは、
  --   DO NOTHING だと既存行が RETURNING で返らないため (PostgreSQL 仕様)。
  INSERT INTO public.series (title, author)
  VALUES (p_title, p_author)
  ON CONFLICT (title, author) DO UPDATE SET title = EXCLUDED.title
  RETURNING id INTO v_series_id;

  -- Step 2: books を insert。既存競合時は既存行を SELECT して返す。
  INSERT INTO public.books (
    series_id, title, author, volume_number,
    thumbnail_url, isbn, published_at, is_adult, store_product_id
  )
  VALUES (
    v_series_id, p_title, p_author, p_volume_number,
    p_thumbnail_url, p_isbn, p_published_at, COALESCE(p_is_adult, false), p_store_product_id
  )
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_book;

  IF v_book.id IS NULL THEN
    -- 競合時 (部分 UNIQUE インデックスに当たった) は既存行を取得。
    -- volume_number の NULL 比較は IS NOT DISTINCT FROM で揃える。
    SELECT * INTO v_book
    FROM public.books
    WHERE series_id = v_series_id
      AND volume_number IS NOT DISTINCT FROM p_volume_number
    LIMIT 1;
  END IF;

  RETURN v_book;
END;
$$;

COMMENT ON FUNCTION public.upsert_book_with_series IS
  'series と books を atomic に登録する。scrape / 手動登録の両経路から使う。SECURITY INVOKER で RLS 維持。';

-- Rollback runbook:
--   DROP FUNCTION IF EXISTS public.upsert_book_with_series(text, text, integer, text, text, date, boolean, text);
