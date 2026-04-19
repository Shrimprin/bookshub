-- ============================================================
-- Migration: series テーブル導入と books.series_id 正規化
--
-- 背景:
--   現状 books は「1 行 = 1 巻」として運用されており、(title, author) は
--   既に同一シリーズの識別子として機能している (extractSeriesTitle が volume を
--   strip したシリーズ名を books.title に入れているため)。ただしシリーズ単位の
--   メタ情報 (完結フラグ、次巻予定日、is_adult のシリーズ昇格等) を保持できず、
--   クエリでも毎回 (title, author) でのグルーピングが必要な状態。
--
--   本マイグレーションで series テーブルに正規化し、books.series_id FK を導入する。
--   既存データは (title, author) グルーピングでそのまま series に寄せられる。
--
-- 変更内容:
--   1. series テーブル作成 (UNIQUE(title, author), RLS 有効)
--   2. books.series_id を NULLABLE で追加
--   3. バックフィル: DISTINCT(title, author) を series に INSERT、books を UPDATE
--   4. バックフィル完全性検証 (NULL 行が残っていれば ERROR)
--   5. books.series_id を NOT NULL + FK (ON DELETE RESTRICT) 化
--   6. books の部分 UNIQUE 制約を (series_id, volume_number) ベースに置換
--   7. series 用 RLS ポリシー (authenticated SELECT/INSERT, UPDATE/DELETE 拒否)
--
-- 非スコープ (別 issue):
--   - books.title / books.author の DROP (段階移行のため残置)
--   - is_adult の series 昇格
--   - シリーズメタ情報 (完結フラグ等)
--   - UI 変更 / API surface 変更
-- ============================================================

-- ============================================================
-- Step 1: series テーブル
-- ============================================================
CREATE TABLE public.series (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text        NOT NULL,
  author     text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT series_title_author_unique UNIQUE (title, author)
);

COMMENT ON TABLE  public.series            IS 'シリーズマスタ (全ユーザー共有)。books が series_id で参照する。';
COMMENT ON COLUMN public.series.title      IS 'シリーズタイトル (巻番号を除いたもの)。extractSeriesTitle 正規化済の値が入る。';
COMMENT ON COLUMN public.series.author     IS 'シリーズ著者名。';

-- ============================================================
-- Step 2: books.series_id を NULLABLE で追加
-- ============================================================
ALTER TABLE public.books
  ADD COLUMN series_id uuid;

-- ============================================================
-- Step 3: バックフィル
--   books は「1 行 = 1 巻」のため (title, author) が重複している行は
--   同一シリーズの異なる巻を表す。DISTINCT で寄せて series に INSERT する。
-- ============================================================
INSERT INTO public.series (title, author)
SELECT DISTINCT title, author FROM public.books
ON CONFLICT (title, author) DO NOTHING;

UPDATE public.books b
SET series_id = s.id
FROM public.series s
WHERE b.title = s.title AND b.author = s.author;

-- ============================================================
-- Step 4: バックフィル完全性検証
--   NULL 行が残っている場合はトランザクション全体を abort する。
--   どの行が残っているかエラーメッセージで可観測化する (デフォルトの
--   "column contains null values" では行数が分からないため)。
-- ============================================================
DO $$
DECLARE
  orphan_count int;
BEGIN
  SELECT COUNT(*) INTO orphan_count FROM public.books WHERE series_id IS NULL;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'series_id backfill incomplete: % book rows have NULL series_id', orphan_count;
  END IF;
END $$;

-- ============================================================
-- Step 5: NOT NULL + FK
-- ============================================================
ALTER TABLE public.books
  ALTER COLUMN series_id SET NOT NULL;

ALTER TABLE public.books
  ADD CONSTRAINT books_series_id_fk
  FOREIGN KEY (series_id) REFERENCES public.series(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.books.series_id IS 'FK → series(id)。シリーズ正規化で導入。ON DELETE RESTRICT (books が参照中の series は削除不可)。';

-- ============================================================
-- Step 6: books の UNIQUE 制約を series_id ベースに置換
--   旧: (title, author) / (title, author, volume_number) の部分 UNIQUE
--   新: (series_id) / (series_id, volume_number) の部分 UNIQUE
--
--   series_id が (title, author) と 1:1 対応するため等価な制約。
--   UI やクエリが series_id 中心に移行できる。
--   これにより (series_id) / (series_id, volume_number) B-tree 索引を兼ねるため、
--   追加の単独 index (books_series_id_idx) は作成しない。
-- ============================================================
DROP INDEX IF EXISTS public.books_single_volume_unique;
DROP INDEX IF EXISTS public.books_multi_volume_unique;

CREATE UNIQUE INDEX books_series_single_volume_unique
  ON public.books (series_id)
  WHERE volume_number IS NULL;

CREATE UNIQUE INDEX books_series_multi_volume_unique
  ON public.books (series_id, volume_number)
  WHERE volume_number IS NOT NULL;

-- ============================================================
-- Step 7: series 用 RLS
--   books の慣習 (20260411000001_fix_rls_policies.sql) を踏襲し、
--   UPDATE/DELETE は明示的に拒否する (USING(false))。
-- ============================================================
ALTER TABLE public.series ENABLE ROW LEVEL SECURITY;

CREATE POLICY "series: 認証ユーザーが参照可" ON public.series
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "series: 認証ユーザーが追加可" ON public.series
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "series: 更新不可" ON public.series
  FOR UPDATE USING (false);

CREATE POLICY "series: 削除不可" ON public.series
  FOR DELETE USING (false);

-- ============================================================
-- Rollback runbook (Supabase は down migration を管理しないため手動実行):
--
--   -- RLS ポリシー削除
--   DROP POLICY IF EXISTS "series: 削除不可"              ON public.series;
--   DROP POLICY IF EXISTS "series: 更新不可"              ON public.series;
--   DROP POLICY IF EXISTS "series: 認証ユーザーが追加可" ON public.series;
--   DROP POLICY IF EXISTS "series: 認証ユーザーが参照可" ON public.series;
--
--   -- UNIQUE 制約を旧 (title, author) ベースに戻す
--   DROP INDEX IF EXISTS public.books_series_multi_volume_unique;
--   DROP INDEX IF EXISTS public.books_series_single_volume_unique;
--   CREATE UNIQUE INDEX books_single_volume_unique
--     ON public.books (title, author)
--     WHERE volume_number IS NULL;
--   CREATE UNIQUE INDEX books_multi_volume_unique
--     ON public.books (title, author, volume_number)
--     WHERE volume_number IS NOT NULL;
--
--   -- FK と NOT NULL を外してから series_id を drop
--   ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_series_id_fk;
--   ALTER TABLE public.books ALTER COLUMN series_id DROP NOT NULL;
--   ALTER TABLE public.books DROP COLUMN IF EXISTS series_id;
--
--   DROP TABLE IF EXISTS public.series;
-- ============================================================
