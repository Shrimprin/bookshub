-- ============================================================
-- Migration: RLS ポリシーのセキュリティ修正
--
-- 変更内容:
--   1. user_books の UPDATE ポリシーに WITH CHECK を追加
--      user_id を他ユーザーの ID に書き換えられる問題を防止
--   2. books テーブルに明示的な UPDATE/DELETE 拒否ポリシーを追加
--      Supabase のデフォルト拒否に依存せず意図を明示する
-- ============================================================

-- ============================================================
-- Fix 1: user_books UPDATE ポリシーに WITH CHECK を追加
-- ============================================================
DROP POLICY IF EXISTS "user_books: 自分のレコードを更新" ON public.user_books;

CREATE POLICY "user_books: 自分のレコードを更新" ON public.user_books
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- Fix 2: books の UPDATE/DELETE を明示的に禁止
--        （全ユーザー共有マスタ: 誰もクライアントから変更不可）
-- ============================================================
CREATE POLICY "books: 更新不可" ON public.books
  FOR UPDATE
  USING (false);

CREATE POLICY "books: 削除不可" ON public.books
  FOR DELETE
  USING (false);
