-- ============================================================
-- Seed data (開発・テスト用)
-- ※ profiles / user_books は Supabase Auth 経由でユーザー作成後に手動テスト
-- ============================================================

INSERT INTO public.books (title, author, thumbnail_url, is_adult) VALUES
  ('ワンピース',         '尾田栄一郎', NULL, false),
  ('鬼滅の刃',           '吾峠呼世晴', NULL, false),
  ('進撃の巨人',         '諫山創',     NULL, false),
  ('チェンソーマン',     '藤本タツキ', NULL, false),
  ('BEASTARS',           '板垣巴留',   NULL, false);

INSERT INTO public.book_volumes (book_id, volume_number, published_at)
SELECT id, v, NULL
FROM public.books, generate_series(1, 3) AS v
WHERE title IN ('ワンピース', '鬼滅の刃', '進撃の巨人', 'チェンソーマン', 'BEASTARS');
