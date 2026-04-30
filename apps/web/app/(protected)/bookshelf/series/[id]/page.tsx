import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { seriesIdSchema } from '@bookhub/shared'
import { createClient } from '@/lib/supabase/server'
import { getSeriesDetail } from '@/lib/books/get-series-detail'
import { BookGallery } from '@/features/bookshelf/book-gallery'
import { EmptyState } from '@/features/bookshelf/empty-state'

// 統一して force-dynamic (本棚と同方針: 拡張機能のスクレイプ後に最新データが見える要件)
export const dynamic = 'force-dynamic'

const MAX_QUERY_LENGTH = 200

interface SeriesDetailPageProps {
  params: Promise<{ id: string }>
  // /bookshelf?q=... から遷移してきた場合に q を保持して戻れるようにする
  searchParams: Promise<{ q?: string }>
}

export default async function SeriesDetailPage({ params, searchParams }: SeriesDetailPageProps) {
  const { id: rawId } = await params
  const parsed = seriesIdSchema.safeParse(rawId)
  if (!parsed.success) notFound()

  const { q } = await searchParams
  const trimmedQ = (q?.trim() ?? '').slice(0, MAX_QUERY_LENGTH)
  const backHref = trimmedQ ? `/bookshelf?q=${encodeURIComponent(trimmedQ)}` : '/bookshelf'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const detail = await getSeriesDetail(supabase, user.id, parsed.data)
  if (!detail) notFound()

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <nav
        className="mb-4 flex items-center gap-1 text-sm text-muted-foreground"
        aria-label="パンくず"
      >
        <Link
          href={backHref}
          className="rounded transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none"
        >
          本棚
        </Link>
        <ChevronRight className="size-3.5" aria-hidden="true" />
        <span aria-current="page" className="text-foreground">
          {detail.series.title}
        </span>
      </nav>
      <header className="mb-6">
        <h1 className="bg-gradient-to-r from-primary to-secondary bg-clip-text font-display text-3xl font-bold tracking-wide text-transparent">
          {detail.series.title}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {detail.series.author} · {detail.volumes.length} 巻所持
        </p>
      </header>
      {/* getSeriesDetail が 0 件で null → notFound() 済のため通常 volumes は空にならないが、
          TOCTOU (チェック後に最後の巻が削除された等) の保険として emptyFallback を渡す。 */}
      <BookGallery books={detail.volumes} emptyFallback={<EmptyState variant="empty" />} />
    </main>
  )
}
