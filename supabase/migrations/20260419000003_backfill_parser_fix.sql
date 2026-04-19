-- ============================================================
-- Migration: 既存 books の parser 適用漏れを修正し series を再バックフィル
--
-- 背景:
--   parser (apps/extension/src/content/shared/parser.ts) は Amazon Kindle の
--   出版社ラベル付きタイトル (例: 「チェンソーマン 10 (ジャンプコミックスDIGITAL)」)
--   に対応できていなかったため、既存 books テーブルには生タイトルが多数入っている。
--   20260419000001 の series バックフィルは books の (title, author) をそのまま
--   使ったため、series も同じ汚染を受け「チェンソーマン」が 11 series に分裂する等
--   の状態になっていた。
--
--   parser を改善 (同 commit) した上で、既存 books を SQL で再解析し、
--   重複する巻を統合 (user_books を keeper に寄せる) した後、series を作り直す。
--
-- 変更内容:
--   1. 一時関数 pg_temp.parse_series_and_volume(text) を定義 (parser 相当)
--   2. books に _new_title / _new_volume_number 一時カラムを追加して計算
--   3. 一時テーブル _merge_map で keeper/loser を決定
--   4. user_books の重複を削除 (keeper 側に既に同 user+store がある場合)
--   5. user_books.book_id を keeper に付け替え
--   6. loser books を削除
--   7. books.title / volume_number を _new_* に置換
--   8. 新 (title, author) を series に INSERT (ON CONFLICT DO NOTHING)
--   9. books.series_id を新 series に再割当
--  10. 参照されなくなった series を削除
--  11. 完全性検証 + 一時カラム / 一時関数 / 一時テーブル cleanup
-- ============================================================

-- ============================================================
-- Step 0: parser 相当の一時関数
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

-- parser の VOLUME_RULES を順に試し、マッチした最初の rule で
-- (series_title, volume_number) を返す。どの rule にもマッチしない場合は
-- (cleaned_title, NULL) を返す。
CREATE OR REPLACE FUNCTION pg_temp.parse_series_and_volume(raw_title text)
RETURNS TABLE(series_title text, volume_number int) AS $func$
DECLARE
  cleaned text;
  m       text[];
  v_num   int;
BEGIN
  cleaned := pg_temp.strip_trailing_label(pg_temp.normalize_digits(raw_title));

  -- Rule 1: 第X巻
  m := regexp_matches(cleaned, '第(\d+)巻');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(
        regexp_replace(cleaned, '\s*第\d+巻.*', ''),
        '\s+(特装版|限定版|通常版)$', ''
      )), v_num;
      RETURN;
    END IF;
  END IF;

  -- Rule 2: X巻
  m := regexp_matches(cleaned, '(\d+)巻');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(
        regexp_replace(cleaned, '\s*\d+巻.*', ''),
        '\s+(特装版|限定版|通常版)$', ''
      )), v_num;
      RETURN;
    END IF;
  END IF;

  -- Rule 3: (X) paren (\d{1,3} で年号や特典コードを排除)
  m := regexp_matches(cleaned, '[（(](\d{1,3})[）)]');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(
        regexp_replace(cleaned, '\s*[（(]\d{1,3}[）)].*', ''),
        '\s+(特装版|限定版|通常版)$', ''
      )), v_num;
      RETURN;
    END IF;
  END IF;

  -- Rule 4: Vol.X
  m := regexp_matches(cleaned, '\s+Vol\.(\d+)', 'i');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(
        regexp_replace(cleaned, '\s+Vol\.\d+.*', '', 'i'),
        '\s+(特装版|限定版|通常版)$', ''
      )), v_num;
      RETURN;
    END IF;
  END IF;

  -- Rule 5: vol X (空白区切り)
  m := regexp_matches(cleaned, '\s+vol\s+(\d+)', 'i');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(
        regexp_replace(cleaned, '\s+vol\s+\d+.*', '', 'i'),
        '\s+(特装版|限定版|通常版)$', ''
      )), v_num;
      RETURN;
    END IF;
  END IF;

  -- Rule 6: 末尾の裸数字 (.{3,}\s+\d{1,3}$)
  m := regexp_matches(cleaned, '.{3,}\s+(\d{1,3})$');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(
        regexp_replace(cleaned, '\s+\d{1,3}$', ''),
        '\s+(特装版|限定版|通常版)$', ''
      )), v_num;
      RETURN;
    END IF;
  END IF;

  -- Rule 7: タイトル途中の裸数字 (^.{3,}?\s+\d{1,3}\s+\S)
  m := regexp_matches(cleaned, '^.{3,}?\s+(\d{1,3})\s+\S');
  IF m IS NOT NULL THEN
    v_num := m[1]::int;
    IF v_num BETWEEN 1 AND 9999 THEN
      RETURN QUERY SELECT btrim(regexp_replace(
        regexp_replace(cleaned, '\s+\d{1,3}\s+.*', ''),
        '\s+(特装版|限定版|通常版)$', ''
      )), v_num;
      RETURN;
    END IF;
  END IF;

  -- どの rule にもマッチしない場合 (単巻作品・ラベル付き単巻など)
  RETURN QUERY SELECT btrim(regexp_replace(cleaned, '\s+(特装版|限定版|通常版)$', '')), NULL::int;
END;
$func$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- Step 1: books に一時カラムを追加
-- ============================================================
ALTER TABLE public.books
  ADD COLUMN _new_title text,
  ADD COLUMN _new_volume_number int;

-- ============================================================
-- Step 2: 各 books を再解析して _new_* に保存
--   UPDATE の FROM 句では target table を LATERAL 内から参照できないため、
--   CTE でサブクエリ側から b.title を LATERAL 呼び出しして ID JOIN する。
-- ============================================================
WITH parsed AS (
  SELECT b.id, r.series_title, r.volume_number
  FROM public.books b
  CROSS JOIN LATERAL pg_temp.parse_series_and_volume(b.title) r
)
UPDATE public.books b
SET
  _new_title         = p.series_title,
  _new_volume_number = p.volume_number
FROM parsed p
WHERE b.id = p.id;

-- ============================================================
-- Step 3: 統合マップを一時テーブルに作成
--   同じ (_new_title, author, _new_volume_number) を持つ複数行を
--   最も古い 1 行 (keeper) に寄せる。
-- ============================================================
CREATE TEMP TABLE _merge_map ON COMMIT DROP AS
SELECT
  id,
  FIRST_VALUE(id) OVER (
    PARTITION BY _new_title, author, _new_volume_number
    ORDER BY created_at, id
  ) AS keeper_id
FROM public.books;

CREATE INDEX ON _merge_map (keeper_id);
CREATE INDEX ON _merge_map (id) WHERE id != keeper_id;

-- ============================================================
-- Step 4: user_books の重複を解消
--   loser 側の book を keeper に付け替えると UNIQUE(user, book, store)
--   制約に違反するケースがあるため、先に重複側を削除する。
-- ============================================================
DELETE FROM public.user_books ub
USING _merge_map mm
WHERE ub.book_id = mm.id
  AND mm.id != mm.keeper_id
  AND EXISTS (
    SELECT 1 FROM public.user_books ub2
    WHERE ub2.book_id = mm.keeper_id
      AND ub2.user_id = ub.user_id
      AND ub2.store   = ub.store
  );

-- ============================================================
-- Step 5: 残った user_books を keeper に付け替え
-- ============================================================
UPDATE public.user_books ub
SET book_id = mm.keeper_id
FROM _merge_map mm
WHERE ub.book_id = mm.id
  AND mm.id != mm.keeper_id;

-- ============================================================
-- Step 6: 不要な loser books を削除
-- ============================================================
DELETE FROM public.books b
USING _merge_map mm
WHERE b.id = mm.id
  AND mm.id != mm.keeper_id;

-- ============================================================
-- Step 7: 残った books の title / volume_number を新値に更新
-- ============================================================
UPDATE public.books
SET
  title         = _new_title,
  volume_number = _new_volume_number;

-- ============================================================
-- Step 8: 新 (title, author) の series を INSERT
-- ============================================================
INSERT INTO public.series (title, author)
SELECT DISTINCT title, author FROM public.books
ON CONFLICT (title, author) DO NOTHING;

-- ============================================================
-- Step 9: books.series_id を新 series に再割当
-- ============================================================
UPDATE public.books b
SET series_id = s.id
FROM public.series s
WHERE b.title = s.title AND b.author = s.author;

-- ============================================================
-- Step 10: 参照されなくなった旧 series を削除
-- ============================================================
DELETE FROM public.series s
WHERE NOT EXISTS (SELECT 1 FROM public.books b WHERE b.series_id = s.id);

-- ============================================================
-- Step 11: 完全性検証 + 一時カラム cleanup
-- ============================================================
DO $$
DECLARE
  orphan_books int;
  orphan_series int;
BEGIN
  SELECT COUNT(*) INTO orphan_books FROM public.books WHERE series_id IS NULL;
  IF orphan_books > 0 THEN
    RAISE EXCEPTION 'cleanup failed: % books have NULL series_id', orphan_books;
  END IF;

  SELECT COUNT(*) INTO orphan_series
  FROM public.series s
  WHERE NOT EXISTS (SELECT 1 FROM public.books b WHERE b.series_id = s.id);
  IF orphan_series > 0 THEN
    RAISE EXCEPTION 'cleanup failed: % orphan series remain after cleanup', orphan_series;
  END IF;
END $$;

ALTER TABLE public.books
  DROP COLUMN _new_title,
  DROP COLUMN _new_volume_number;

-- pg_temp の関数はセッション終了時に自動削除される。
-- _merge_map は ON COMMIT DROP で自動削除される。

-- ============================================================
-- Rollback runbook (Supabase は down migration を管理しないため手動実行):
--
-- このマイグレーションは破壊的 (books の title/volume_number を書き換え、
-- 旧 series を削除) なので完全な rollback は不可能。バックアップから
-- books / user_books / series を復元すること。
-- ============================================================
