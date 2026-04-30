import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserSeries } from '@/lib/books/get-user-series'
import { SeriesGallery } from '@/features/bookshelf/series-gallery'
import { BookSearchForm } from '@/features/bookshelf/book-search-form'
import { EmptyState } from '@/features/bookshelf/empty-state'
import { KindleImportButton } from '@/features/bookshelf/kindle-import-button'

// TODO: revalidateTag + unstable_cache に移行する (docs/specs/architecture.md 参照)
// 現状は拡張機能のスクレイプ後リロードで最新データが出れば要件充足のため force-dynamic で許容
export const dynamic = 'force-dynamic'

const MIN_QUERY_LENGTH = 2
// `getUserSeries` の q は zod schema を経由しない (SC が直接呼ぶため)。
// 悪意ある長文クエリによる DoS 耐性として API 側 `getBooksQuerySchema.q` の max(200) と
// 同値で明示的に切り詰める。
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

  const { series, total } = await getUserSeries(supabase, user.id, {
    page: 1,
    limit: DEFAULT_LIMIT,
    ...(hasQuery ? { q: trimmed } : {}),
  })

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-3xl font-bold tracking-wide text-foreground">本棚</h1>
          <p className="font-mono text-sm text-muted-foreground">{total} シリーズ</p>
        </div>
        <KindleImportButton />
      </header>
      <BookSearchForm defaultValue={trimmed} />
      <SeriesGallery
        series={series}
        emptyFallback={<EmptyState variant={hasQuery ? 'no-results' : 'empty'} />}
      />
    </main>
  )
}
