import type { GetBooksQuery } from '@bookhub/shared'
import { createClient } from '@/lib/supabase/server'
import { getUserBooks } from '@/lib/books/get-user-books'
import { BookGallery } from '@/features/bookshelf/book-gallery'
import { BookSearchForm } from '@/features/bookshelf/book-search-form'

// TODO: revalidateTag + unstable_cache に移行する (docs/specs/architecture.md 参照)
// 現状は拡張機能のスクレイプ後リロードで最新データが出れば要件充足のため force-dynamic で許容
export const dynamic = 'force-dynamic'

const MIN_QUERY_LENGTH = 2
const DEFAULT_LIMIT = 100

interface BookshelfPageProps {
  searchParams: Promise<{ q?: string }>
}

export default async function BookshelfPage({ searchParams }: BookshelfPageProps) {
  const { q } = await searchParams
  const trimmed = q?.trim() ?? ''
  const hasQuery = trimmed.length >= MIN_QUERY_LENGTH

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // (protected) layout で未ログインは /login にリダイレクト済みだが型ガード
  if (!user) return null

  const query: GetBooksQuery = {
    page: 1,
    limit: DEFAULT_LIMIT,
    ...(hasQuery ? { q: trimmed } : {}),
  }

  const { books, total } = await getUserBooks(supabase, user.id, query)

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">本棚</h1>
        <p className="text-sm text-muted-foreground">{total} 冊</p>
      </header>
      <BookSearchForm defaultValue={trimmed} />
      <BookGallery books={books} isSearching={hasQuery} />
    </main>
  )
}
