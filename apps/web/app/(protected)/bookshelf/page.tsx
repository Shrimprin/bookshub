import { redirect } from 'next/navigation'
import type { GetBooksQuery } from '@bookhub/shared'
import { createClient } from '@/lib/supabase/server'
import { getUserBooks } from '@/lib/books/get-user-books'
import { BookGallery } from '@/features/bookshelf/book-gallery'
import { BookSearchForm } from '@/features/bookshelf/book-search-form'
import { EmptyState } from '@/features/bookshelf/empty-state'

// TODO: revalidateTag + unstable_cache に移行する (docs/specs/architecture.md 参照)
// 現状は拡張機能のスクレイプ後リロードで最新データが出れば要件充足のため force-dynamic で許容
export const dynamic = 'force-dynamic'

const MIN_QUERY_LENGTH = 2
// getBooksQuerySchema.q の max(200) と同値にする (SC は直接 getUserBooks を呼ぶため
// zod schema を通らない。悪意ある長文クエリによる DoS 耐性として明示的に切り詰める)
const MAX_QUERY_LENGTH = 200
const DEFAULT_LIMIT = 100

interface BookshelfPageProps {
  searchParams: Promise<{ q?: string }>
}

export default async function BookshelfPage({ searchParams }: BookshelfPageProps) {
  const { q } = await searchParams
  const trimmed = (q?.trim() ?? '').slice(0, MAX_QUERY_LENGTH)
  const hasQuery = trimmed.length >= MIN_QUERY_LENGTH

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // (protected) layout で未ログインは redirect 済みだが、layout と page は独立に
  // RSC render されるため二段構えで redirect する (defense in depth)
  if (!user) {
    redirect('/login')
  }

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
      <BookGallery
        books={books}
        emptyFallback={<EmptyState variant={hasQuery ? 'no-results' : 'empty'} />}
      />
    </main>
  )
}
