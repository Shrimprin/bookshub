-- ============================================================
-- Seed data (開発・テスト用)
-- ※ profiles / user_books は Supabase Auth 経由でユーザー作成後に手動テスト
-- ============================================================

INSERT INTO public.books (title, author, volume_number, thumbnail_url, is_adult) VALUES
  ('ワンピース',         '尾田栄一郎', 1, NULL, false),
  ('ワンピース',         '尾田栄一郎', 2, NULL, false),
  ('ワンピース',         '尾田栄一郎', 3, NULL, false),
  ('鬼滅の刃',           '吾峠呼世晴', 1, NULL, false),
  ('鬼滅の刃',           '吾峠呼世晴', 2, NULL, false),
  ('鬼滅の刃',           '吾峠呼世晴', 3, NULL, false),
  ('進撃の巨人',         '諫山創',     1, NULL, false),
  ('進撃の巨人',         '諫山創',     2, NULL, false),
  ('進撃の巨人',         '諫山創',     3, NULL, false),
  ('チェンソーマン',     '藤本タツキ', 1, NULL, false),
  ('チェンソーマン',     '藤本タツキ', 2, NULL, false),
  ('チェンソーマン',     '藤本タツキ', 3, NULL, false),
  ('BEASTARS',           '板垣巴留',   1, NULL, false),
  ('BEASTARS',           '板垣巴留',   2, NULL, false),
  ('BEASTARS',           '板垣巴留',   3, NULL, false);
