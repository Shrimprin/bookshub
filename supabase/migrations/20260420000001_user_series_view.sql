-- ============================================================
-- Migration: user_series_view を導入してシリーズ単位の本棚集約を提供
--
-- 背景:
--   #33 で /bookshelf をシリーズ一覧 + 巻詳細の二階層 UI に再構成する。
--   シリーズ単位の集約 (volume_count, cover_thumbnail_url, stores) を
--   PostgREST から `count: 'exact'` でページング可能な形で取得したい。
--
--   JS 側集約案 (LIMIT 5000 で打ち切り) も検討したが、二度買い防止という
--   コア価値に対して silently truncate のリスクがあるため view 化を採用。
--
-- 設計:
--   - `WITH (security_invoker = on)` で view 経由 SELECT に呼出ユーザーの
--     RLS を適用する。`user_books` の `auth.uid() = user_id` ポリシーが
--     view 経由でも自動的に効く。
--   - PostgREST 側でも defense in depth として `.eq('user_id', userId)` を
--     明示する想定 (アプリ層の規約)。
--   - cover_thumbnail_url は「最小 volume_number で thumbnail_url が NOT NULL の
--     最初の巻」を correlated subquery で取得。1 巻だけ表紙未取得でカードが
--     No Cover になる UX 劣化を防ぐ。
--   - stores は ARRAY サブクエリで「DISTINCT + sort 安定」させる。GROUP BY 内で
--     ARRAY_AGG(DISTINCT ...) を使うと未指定 ORDER で非決定的になるため。
--   - last_added_at は将来の「最近追加順」ソートのための余地。
-- ============================================================

CREATE OR REPLACE VIEW public.user_series_view
WITH (security_invoker = on)
AS
SELECT
  ub.user_id,
  s.id   AS series_id,
  s.title,
  s.author,
  COUNT(DISTINCT b.id)::int AS volume_count,
  (
    SELECT b2.thumbnail_url
    FROM public.books b2
    JOIN public.user_books ub2 ON ub2.book_id = b2.id
    WHERE b2.series_id = s.id
      AND ub2.user_id = ub.user_id
      AND b2.thumbnail_url IS NOT NULL
    ORDER BY b2.volume_number ASC NULLS LAST, b2.created_at ASC
    LIMIT 1
  ) AS cover_thumbnail_url,
  ARRAY(
    SELECT DISTINCT ub3.store
    FROM public.user_books ub3
    JOIN public.books b3 ON b3.id = ub3.book_id
    WHERE b3.series_id = s.id
      AND ub3.user_id = ub.user_id
    ORDER BY ub3.store
  ) AS stores,
  MAX(ub.created_at) AS last_added_at
FROM public.user_books ub
JOIN public.books   b ON b.id = ub.book_id
JOIN public.series  s ON s.id = b.series_id
GROUP BY ub.user_id, s.id, s.title, s.author;

-- security_invoker = on のため authenticated ロールに SELECT 権を付与すれば
-- 内部テーブルの RLS が自動的に効く。
GRANT SELECT ON public.user_series_view TO authenticated;

-- ============================================================
-- Rollback runbook (Supabase は down migration を管理しないため手動実行):
--
--   REVOKE SELECT ON public.user_series_view FROM authenticated;
--   DROP VIEW IF EXISTS public.user_series_view;
-- ============================================================
