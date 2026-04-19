-- books.store_product_id に DB レベルの CHECK 制約を追加 (defense in depth)。
-- アプリ層の Zod バリデーション (storeProductIdSchema) と同じ規則を DB 側でも
-- 強制することで、service_role キー経由や将来の別クライアントからの直接 INSERT で
-- 許可外文字 (制御文字、スラッシュ等) が混入するのを防ぐ。
--
-- 許容: 英数字 + `_` `.` `-` のみ、1-64 文字。
-- open redirect の芽を断つため `/` は除外。
-- NULL は制約対象外 (PostgreSQL CHECK は NULL を許可する仕様)。

ALTER TABLE public.books
  ADD CONSTRAINT books_store_product_id_format
  CHECK (store_product_id IS NULL OR store_product_id ~ '^[A-Za-z0-9_.-]{1,64}$');

-- Rollback runbook:
--   ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_store_product_id_format;
