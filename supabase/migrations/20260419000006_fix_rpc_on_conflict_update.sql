-- ============================================================
-- Migration: upsert_book_with_series の ON CONFLICT DO UPDATE を廃止
--
-- 背景:
--   series テーブルには「UPDATE USING (false)」の RLS ポリシーがあり、
--   認証ユーザーでも UPDATE は常に拒否される (20260419000001 で導入)。
--
--   現状の RPC (20260419000002) では
--     INSERT ... ON CONFLICT (title, author) DO UPDATE SET title = EXCLUDED.title
--   を使っていた。これは RETURNING id を競合時でも得るための「擬似 no-op
--   UPDATE」だが、ON CONFLICT DO UPDATE は競合時に UPDATE 文を実行するため
--   RLS の UPDATE ポリシーが評価され **403 で失敗する**。
--
--   結果: 既存 series に対して scrape すると RPC が 403 で throw し、
--   processScrapePayload のループが途中で止まり user_books が作成されない
--   (books は途中まで INSERT されるが所持情報は空のまま孤立する)。
--
-- 変更内容:
--   ON CONFLICT DO NOTHING に変更し、INSERT が no-op だった場合は別 SELECT
--   で既存 series.id を取得する。SELECT は RLS の SELECT ポリシー
--   (auth.role() = 'authenticated') で通る。
--
--   books 側は既に ON CONFLICT DO NOTHING + SELECT fallback で実装済なので
--   変更不要。
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
  -- Step 1: series upsert。DO UPDATE は RLS の UPDATE USING(false) に
  -- 阻まれるので、DO NOTHING + SELECT fallback で id を得る。
  INSERT INTO public.series (title, author)
  VALUES (p_title, p_author)
  ON CONFLICT (title, author) DO NOTHING
  RETURNING id INTO v_series_id;

  IF v_series_id IS NULL THEN
    SELECT id INTO v_series_id
    FROM public.series
    WHERE title = p_title AND author = p_author;
  END IF;

  -- ここで v_series_id が NULL の場合は RLS SELECT も通らない異常状態
  IF v_series_id IS NULL THEN
    RAISE EXCEPTION 'series upsert failed: cannot resolve id for (%, %)', p_title, p_author;
  END IF;

  -- Step 2: books upsert。こちらは ON CONFLICT DO NOTHING + SELECT fallback
  -- で元々対応済。
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

-- Rollback runbook:
--   20260419000004_drop_books_title_author.sql の CREATE OR REPLACE ブロックを
--   再適用する (ON CONFLICT DO UPDATE SET title = EXCLUDED.title に戻るが、
--   series RLS UPDATE 拒否と衝突して 403 を発生させる既知のバグに戻るので注意)。
