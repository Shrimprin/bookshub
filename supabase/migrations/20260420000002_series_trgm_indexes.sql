-- ============================================================
-- Migration: series.title / series.author に pg_trgm GIN インデックスを追加
--
-- 背景:
--   #33 で /bookshelf にシリーズ単位 ILIKE 検索 (`title.ilike` / `author.ilike`)
--   を導入したが、series 側にインデックスが無いため seq scan になっている。
--   #31/#33 の経緯で旧 books.title/author 上の B-tree インデックスは DROP 済で、
--   現状 series 側には UNIQUE 制約 (title, author) しか索引が存在しない。
--   prefix 一致しか UNIQUE 索引は使えないため、`%キーワード%` の中間一致は seq
--   scan になり、シリーズ件数が増えると `/bookshelf?q=...` が悪化する。
--
--   pg_trgm の GIN インデックスは ILIKE の中間一致 (`%foo%`) にも効くため、
--   検索性能を中長期的に確保するために導入する。
--
-- 変更内容:
--   1. pg_trgm 拡張を有効化 (PostgreSQL 公式拡張、Supabase で利用可能)
--   2. series.title に GIN trigram インデックス
--   3. series.author に GIN trigram インデックス
--
-- 影響:
--   - 検索 (`title.ilike` / `author.ilike`) のクエリプランが index scan に切り替わる
--   - 書き込み (INSERT/UPDATE) コストは GIN なので B-tree より僅かに重いが、
--     series の書き込みは scrape でのみ発生 (低頻度) なので無視できる範囲
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_series_title_trgm
  ON public.series USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_series_author_trgm
  ON public.series USING gin (author gin_trgm_ops);

-- ============================================================
-- Rollback runbook (Supabase は down migration を管理しないため手動実行):
--
--   DROP INDEX IF EXISTS public.idx_series_author_trgm;
--   DROP INDEX IF EXISTS public.idx_series_title_trgm;
--   -- pg_trgm は他で使う場合は残す。専有なら DROP EXTENSION pg_trgm;
-- ============================================================
