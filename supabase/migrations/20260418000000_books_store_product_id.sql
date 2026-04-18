-- books.store_product_id: ストア固有の商品ID (Amazon ASIN / DMM コンテンツID 等)。
-- 目的: 書影から派生できないストア商品ページへの deep link 生成のため永続化する (#32)。
-- 既存行は NULL のまま (Out of Scope: レガシー行の事後補完)。

ALTER TABLE public.books
  ADD COLUMN store_product_id text;

-- 部分インデックス: NULL 行は索引対象外にすることで初期流入時の大量 NULL を無駄に
-- 索引しない。同じ ASIN / コンテンツID からの逆引き (将来の重複判定等) を高速化する。
CREATE INDEX books_store_product_id_idx
  ON public.books (store_product_id)
  WHERE store_product_id IS NOT NULL;

COMMENT ON COLUMN public.books.store_product_id IS
  'ストア固有の商品ID (Amazon ASIN / DMM コンテンツID 等)。NULL 可。';

-- Rollback runbook (Supabase は down migration を管理しないため手動実行):
--   DROP INDEX IF EXISTS public.books_store_product_id_idx;
--   ALTER TABLE public.books DROP COLUMN IF EXISTS store_product_id;
