-- ============================================================
-- Migration: series テーブルに次巻ステータスキャッシュ列を追加
--
-- Issue #15「次巻ステータス表示」に伴い、楽天ブックスAPI で取得した
-- 「次の巻 (max_owned_volume + 1)」の状態を series テーブルに永続化する。
--
-- 設計判断:
--   - 別テーブル (`series_next_volume_cache`) ではなく series 列追加を採用。
--     N+1 回避のため `user_series_view` に LEFT JOIN ではなく直接列を含めたい。
--     キャッシュ TTL の期限は `next_volume_checked_at` で表現。
--   - 書き込みは server side のみ (cron + /api/books POST 内同期 lookup)。
--     `service_role` client で直接 UPDATE する。authenticated client から
--     呼べる SECURITY DEFINER RPC は導入しない (攻撃面拡大を避ける)。
--   - `series` の RLS は現状 UPDATE が `USING (false)` で全 deny。
--     その不変条件を保ったまま、サーバ経路 (service_role) でのみ更新する。
--
-- カラム:
--   next_volume_status            : 'unknown' | 'scheduled' | 'released' | NULL
--   next_volume_release_date      : 発売日 (YYYY-MM-DD)。年月のみの場合は当月1日。
--                                   表示精度はアプリ側で next_volume_release_date_text
--                                   ではなく releaseDate から再構築する想定だが、
--                                   MVP では date 型 1 列で集約。
--   next_volume_expected_number   : 期待される次巻番号 (現在最大巻 + 1)
--   next_volume_checked_at        : 最後に lookup した時刻 (TTL 計算に使う)
--   next_volume_error_count       : poison pill 対策のためのリトライ回数
-- ============================================================

ALTER TABLE public.series
  ADD COLUMN next_volume_status text
    CHECK (next_volume_status IN ('unknown', 'scheduled', 'released')),
  ADD COLUMN next_volume_release_date date,
  ADD COLUMN next_volume_expected_number integer
    CHECK (next_volume_expected_number IS NULL OR next_volume_expected_number > 0),
  ADD COLUMN next_volume_checked_at timestamptz,
  ADD COLUMN next_volume_error_count integer NOT NULL DEFAULT 0
    CHECK (next_volume_error_count >= 0);

-- cron の queue インデックス: NULL (新規未 lookup) を最優先で拾う。
-- 14 日 TTL を超えた行のみ refresh 対象になるため、フルスキャンを避ける。
CREATE INDEX idx_series_next_volume_queue
  ON public.series (next_volume_checked_at NULLS FIRST);

COMMENT ON COLUMN public.series.next_volume_status IS
  '次巻ステータス: unknown=未lookup or 該当なし, scheduled=発売予定, released=発売済';
COMMENT ON COLUMN public.series.next_volume_checked_at IS
  '最後に楽天 lookup を実行した時刻。TTL (デフォルト 14 日) と poison pill 抑制に使用';
COMMENT ON COLUMN public.series.next_volume_error_count IS
  'lookup 失敗の連続回数。閾値 (5) を超えたら一定期間 lookup を停止する';

-- ============================================================
-- Rollback runbook (Supabase は down migration を管理しないため手動実行):
--
--   DROP INDEX IF EXISTS public.idx_series_next_volume_queue;
--   ALTER TABLE public.series
--     DROP COLUMN IF EXISTS next_volume_status,
--     DROP COLUMN IF EXISTS next_volume_release_date,
--     DROP COLUMN IF EXISTS next_volume_expected_number,
--     DROP COLUMN IF EXISTS next_volume_checked_at,
--     DROP COLUMN IF EXISTS next_volume_error_count;
--   その後 user_series_view を 20260420000001 の定義に戻す
--   (CREATE OR REPLACE で next_volume_* 列を含まない元の SELECT に再定義)。
-- ============================================================
