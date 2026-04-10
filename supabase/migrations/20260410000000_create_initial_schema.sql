-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS moddatetime SCHEMA extensions;

-- ============================================================
-- Table: profiles
-- ============================================================
CREATE TABLE public.profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  avatar_url   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.profiles IS 'auth.users と 1:1 のユーザープロフィール。email は auth.users から取得する。';

-- ============================================================
-- Table: books  (作品マスタ・全ユーザー共有)
-- ============================================================
CREATE TABLE public.books (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text        NOT NULL,
  author        text        NOT NULL,
  thumbnail_url text,
  is_adult      boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT books_title_author_unique UNIQUE (title, author)
);

COMMENT ON TABLE  public.books          IS '書籍マスタ（全ユーザー共有）。同タイトル・同作者の重複を防ぐ。';
COMMENT ON COLUMN public.books.is_adult IS '成人向けコンテンツフラグ。true の場合は本棚を分離して表示する。';

-- ============================================================
-- Table: book_volumes  (巻情報)
-- ============================================================
CREATE TABLE public.book_volumes (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id       uuid    NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  volume_number integer NOT NULL,
  isbn          text,
  published_at  date,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT book_volumes_book_volume_unique UNIQUE (book_id, volume_number)
);

COMMENT ON TABLE public.book_volumes IS '作品ごとの巻情報。次巻ステータス表示に使用する。';

-- ============================================================
-- Table: user_books  (ユーザー所持情報)
-- ============================================================
CREATE TABLE public.user_books (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id          uuid        NOT NULL REFERENCES public.books(id)    ON DELETE CASCADE,
  store            text        NOT NULL CHECK (store IN ('kindle', 'dmm', 'other')),
  max_volume_owned integer     NOT NULL DEFAULT 1 CHECK (max_volume_owned >= 1),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_books_user_book_store_unique UNIQUE (user_id, book_id, store)
);

COMMENT ON TABLE  public.user_books              IS 'ユーザーの所持情報。ストアごとに管理し、二度買い防止アラートに使用する。';
COMMENT ON COLUMN public.user_books.store        IS '購入ストア: kindle / dmm / other';
COMMENT ON COLUMN public.user_books.max_volume_owned IS '当該ストアで所持している最大巻数';

-- ============================================================
-- Indexes
-- ============================================================
CREATE INDEX idx_user_books_user_id          ON public.user_books (user_id);
CREATE INDEX idx_user_books_user_id_book_id  ON public.user_books (user_id, book_id);
CREATE INDEX idx_books_title                 ON public.books (title);
CREATE INDEX idx_book_volumes_book_id        ON public.book_volumes (book_id);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.book_volumes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_books   ENABLE ROW LEVEL SECURITY;

-- profiles: 自分のプロフィールのみ読み書き可
CREATE POLICY "profiles: 自分のレコードを参照" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles: 自分のレコードを更新" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- books: 認証済みユーザーは全件参照・追加可（共有マスタ）
CREATE POLICY "books: 認証ユーザーが参照可" ON public.books
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "books: 認証ユーザーが追加可" ON public.books
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- book_volumes: 認証済みユーザーは全件参照・追加可
CREATE POLICY "book_volumes: 認証ユーザーが参照可" ON public.book_volumes
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "book_volumes: 認証ユーザーが追加可" ON public.book_volumes
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- user_books: 自分の所持情報のみ CRUD 可
CREATE POLICY "user_books: 自分のレコードを参照" ON public.user_books
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_books: 自分のレコードを追加" ON public.user_books
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_books: 自分のレコードを更新" ON public.user_books
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "user_books: 自分のレコードを削除" ON public.user_books
  FOR DELETE USING (auth.uid() = user_id);

-- ============================================================
-- Trigger: auth.users INSERT → profiles 自動作成
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS trigger AS $$
  BEGIN
    INSERT INTO public.profiles (id)
    VALUES (NEW.id);
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Trigger: user_books.updated_at 自動更新
-- ============================================================
CREATE TRIGGER user_books_updated_at
  BEFORE UPDATE ON public.user_books
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);
