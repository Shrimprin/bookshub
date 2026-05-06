-- ============================================================
-- Migration: user_series_view に次巻ステータス列を追加
--
-- Issue #15「次巻ステータス表示」に伴い、20260420000001 で定義した
-- user_series_view を再定義し、series テーブルに追加した
-- next_volume_* 列を SELECT に含める。
--
-- 既存の SELECT 部 (volume_count / cover_thumbnail_url / stores / last_added_at) は
-- 20260420000001_user_series_view.sql の定義をそのまま 1:1 で継承し、
-- next_volume_* 4 列のみを末尾に追加する diff にする。
-- 列順を後ろに足すことで、`select('series_id, title, ...')` のように列名指定で
-- 読んでいるアプリ側 (apps/web/lib/books/get-user-series.ts) は壊れない。
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
  MAX(ub.created_at) AS last_added_at,
  s.next_volume_status,
  s.next_volume_release_date,
  s.next_volume_expected_number,
  s.next_volume_checked_at
FROM public.user_books ub
JOIN public.books   b ON b.id = ub.book_id
JOIN public.series  s ON s.id = b.series_id
GROUP BY
  ub.user_id, s.id, s.title, s.author,
  s.next_volume_status, s.next_volume_release_date,
  s.next_volume_expected_number, s.next_volume_checked_at;

GRANT SELECT ON public.user_series_view TO authenticated;

-- ============================================================
-- Rollback runbook:
--   20260420000001_user_series_view.sql の定義を再度 CREATE OR REPLACE で適用。
--   その後 20260506000001 のロールバックを実行する。
-- ============================================================
