-- ============================================================
-- Migration: parser 修正後に拡張機能の古いビルドから入った汚染行を再クリーンアップ
--
-- 背景:
--   20260419000003_backfill_parser_fix.sql 適用後、拡張機能 dist が古いままの
--   ユーザーから新たに scrape が入り、books (→ series) に「呪術廻戦 24
--   (ジャンプコミックスDIGITAL)」等の未 parse タイトルが再度流入してしまった。
--   parser は packages/shared に移動し server 側にも防御 parse を導入したため、
--   今後の新規 INSERT は正規化されるが、既に入った汚染行をここで再度掃除する。
--
-- 変更内容:
--   20260419000003 と同じロジック (pg_temp.parse_series_and_volume) を再実行。
--   books.title は DROP 済 (20260419000004) なので、今回は series.title /
--   series.author を対象に re-parse し、books は series_id を付け替え直す。
--
-- 実行順:
--   1. pg_temp 関数を再定義 (normalize_digits, strip_trailing_label,
--      parse_series_and_volume)
--   2. series に _new_title / _new_author を一時付与して再計算
--   3. 一時テーブル _series_merge_map で keeper/loser を決定
--   4. books.series_id を keeper にリダイレクト
--   5. loser series を削除
--   6. series.title / author を _new_* に置換
--   7. 完全性検証 + cleanup
-- ============================================================

-- ============================================================
-- Step 0: pg_temp parser (20260419000003 と同じロジック)
-- ============================================================

CREATE OR REPLACE FUNCTION pg_temp.normalize_digits(t text) RETURNS text AS $$
  SELECT translate(t, '０１２３４５６７８９', '0123456789');
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.strip_trailing_label(t text) RETURNS text AS $$
  SELECT btrim(
    regexp_replace(
      t,
      '\s*[（(][^（(）)]*(コミック|文庫|ブックス|ライブラリ|DIGITAL)[^（(）)]*[）)]\s*$',
      '',
      'gi'
    )
  );
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION pg_temp.parse_series_and_volume(raw_title text)
RETURNS TABLE(series_title text, volume_number int) AS $func$
DECLARE
  cleaned text;
  m       text[];
  v_num   int;
BEGIN
  cleaned := pg_temp.strip_trailing_label(pg_temp.normalize_digits(raw_title));

  m := regexp_matches(cleaned, '第(\d+)巻');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(regexp_replace(cleaned, '\s*第\d+巻.*', ''), '\s+(特装版|限定版|通常版)$', '')), v_num;
      RETURN;
    END IF;
  END IF;

  m := regexp_matches(cleaned, '(\d+)巻');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(regexp_replace(cleaned, '\s*\d+巻.*', ''), '\s+(特装版|限定版|通常版)$', '')), v_num;
      RETURN;
    END IF;
  END IF;

  m := regexp_matches(cleaned, '[（(](\d{1,3})[）)]');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(regexp_replace(cleaned, '\s*[（(]\d{1,3}[）)].*', ''), '\s+(特装版|限定版|通常版)$', '')), v_num;
      RETURN;
    END IF;
  END IF;

  m := regexp_matches(cleaned, '\s+Vol\.(\d+)', 'i');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(regexp_replace(cleaned, '\s+Vol\.\d+.*', '', 'i'), '\s+(特装版|限定版|通常版)$', '')), v_num;
      RETURN;
    END IF;
  END IF;

  m := regexp_matches(cleaned, '\s+vol\s+(\d+)', 'i');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(regexp_replace(cleaned, '\s+vol\s+\d+.*', '', 'i'), '\s+(特装版|限定版|通常版)$', '')), v_num;
      RETURN;
    END IF;
  END IF;

  m := regexp_matches(cleaned, '.{3,}\s+(\d{1,3})$');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(regexp_replace(cleaned, '\s+\d{1,3}$', ''), '\s+(特装版|限定版|通常版)$', '')), v_num;
      RETURN;
    END IF;
  END IF;

  m := regexp_matches(cleaned, '^.{3,}?\s+(\d{1,3})\s+\S');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(regexp_replace(cleaned, '\s+\d{1,3}\s+.*', ''), '\s+(特装版|限定版|通常版)$', '')), v_num;
      RETURN;
    END IF;
  END IF;

  RETURN QUERY SELECT btrim(regexp_replace(cleaned, '\s+(特装版|限定版|通常版)$', '')), NULL::int;
END;
$func$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- Step 1: series に一時カラムを追加して再計算
-- ============================================================
ALTER TABLE public.series
  ADD COLUMN _new_title text,
  ADD COLUMN _new_volume_number int;

WITH parsed AS (
  SELECT s.id, r.series_title, r.volume_number
  FROM public.series s
  CROSS JOIN LATERAL pg_temp.parse_series_and_volume(s.title) r
)
UPDATE public.series s
SET _new_title = p.series_title, _new_volume_number = p.volume_number
FROM parsed p
WHERE s.id = p.id;

-- ============================================================
-- Step 2: 統合マップ
--   series は (title, author) UNIQUE なので、同じ (_new_title, author) を
--   持つ複数 series を最も古い 1 行 (keeper) に寄せる。
-- ============================================================
CREATE TEMP TABLE _series_merge_map ON COMMIT DROP AS
SELECT
  id,
  FIRST_VALUE(id) OVER (
    PARTITION BY _new_title, author
    ORDER BY created_at, id
  ) AS keeper_id,
  _new_title,
  _new_volume_number
FROM public.series;

CREATE INDEX ON _series_merge_map (keeper_id);
CREATE INDEX ON _series_merge_map (id);

-- ============================================================
-- Step 3: books.series_id を keeper に付け替え
--   ただし loser 側の books には volume_number が埋まっておらず
--   _new_volume_number (parse 結果) に再設定する必要がある。
--   volume_number を確定してから series_id を移す順序で処理する。
-- ============================================================

-- 3a: loser series に属する books は、series.title から parse した
--     _new_volume_number を volume_number にセット (既存 volume_number が null の場合のみ)
UPDATE public.books b
SET volume_number = mm._new_volume_number
FROM _series_merge_map mm
WHERE b.series_id = mm.id
  AND mm.id != mm.keeper_id
  AND b.volume_number IS NULL
  AND mm._new_volume_number IS NOT NULL;

-- 3b: UNIQUE 違反を避けるため、keeper 側に既に同一 volume_number の
--     book が存在する場合は loser 側の user_books を keeper の book へ
--     付け替え、loser の book を削除する。
WITH book_keeper_map AS (
  SELECT
    loser.id AS loser_book_id,
    keeper.id AS keeper_book_id
  FROM public.books loser
  JOIN _series_merge_map mm ON mm.id = loser.series_id AND mm.id != mm.keeper_id
  JOIN public.books keeper
    ON keeper.series_id = mm.keeper_id
    AND keeper.volume_number IS NOT DISTINCT FROM loser.volume_number
)
-- 重複する user_books (keeper 側に既に同じ user+store 組合せがある) を削除
DELETE FROM public.user_books ub
USING book_keeper_map bkm
WHERE ub.book_id = bkm.loser_book_id
  AND EXISTS (
    SELECT 1 FROM public.user_books ub2
    WHERE ub2.book_id = bkm.keeper_book_id
      AND ub2.user_id = ub.user_id
      AND ub2.store   = ub.store
  );

-- 残りの user_books を keeper book へ
WITH book_keeper_map AS (
  SELECT
    loser.id AS loser_book_id,
    keeper.id AS keeper_book_id
  FROM public.books loser
  JOIN _series_merge_map mm ON mm.id = loser.series_id AND mm.id != mm.keeper_id
  JOIN public.books keeper
    ON keeper.series_id = mm.keeper_id
    AND keeper.volume_number IS NOT DISTINCT FROM loser.volume_number
)
UPDATE public.user_books ub
SET book_id = bkm.keeper_book_id
FROM book_keeper_map bkm
WHERE ub.book_id = bkm.loser_book_id;

-- loser 側の重複 book を削除
DELETE FROM public.books b
USING (
  SELECT loser.id AS loser_book_id
  FROM public.books loser
  JOIN _series_merge_map mm ON mm.id = loser.series_id AND mm.id != mm.keeper_id
  JOIN public.books keeper
    ON keeper.series_id = mm.keeper_id
    AND keeper.volume_number IS NOT DISTINCT FROM loser.volume_number
) dup
WHERE b.id = dup.loser_book_id;

-- 3c: 残った loser books の series_id を keeper に付け替え
UPDATE public.books b
SET series_id = mm.keeper_id
FROM _series_merge_map mm
WHERE b.series_id = mm.id
  AND mm.id != mm.keeper_id;

-- ============================================================
-- Step 4: 参照されなくなった loser series を削除
-- ============================================================
DELETE FROM public.series s
WHERE NOT EXISTS (SELECT 1 FROM public.books b WHERE b.series_id = s.id);

-- ============================================================
-- Step 5: 残った series (keeper) の title / author 正規化
-- ============================================================
UPDATE public.series s
SET title = s._new_title
WHERE s._new_title IS NOT NULL
  AND s._new_title <> s.title;

-- ============================================================
-- Step 6: 完全性検証 + cleanup
-- ============================================================
DO $$
DECLARE
  orphan_books    int;
  dirty_series    int;
BEGIN
  SELECT COUNT(*) INTO orphan_books FROM public.books WHERE series_id IS NULL;
  IF orphan_books > 0 THEN
    RAISE EXCEPTION 'cleanup failed: % books have NULL series_id', orphan_books;
  END IF;

  SELECT COUNT(*) INTO dirty_series
  FROM public.series
  WHERE title ~ '\s+\d{1,3}$'
     OR title ~ '[（(][^）)]*(コミック|文庫|ブックス|ライブラリ|DIGITAL)[^）)]*[）)]';
  IF dirty_series > 0 THEN
    RAISE WARNING 'cleanup: % series rows still look dirty (manual review recommended)', dirty_series;
  END IF;
END $$;

ALTER TABLE public.series
  DROP COLUMN _new_title,
  DROP COLUMN _new_volume_number;

-- ============================================================
-- 本番適用前の前提条件 (必須):
--   1. Supabase Dashboard > Database > Backups で Point-in-Time Recovery
--      スナップショットを取得済みであること。
--   2. メンテナンス時間帯に実行。scrape 書き込みと競合しうる。
--
-- Rollback runbook:
--   このマイグレーションは破壊的 (series 統合・book 削除) のため
--   完全な rollback は不可能。Point-in-Time Recovery から series / books /
--   user_books を復元すること。
-- ============================================================
