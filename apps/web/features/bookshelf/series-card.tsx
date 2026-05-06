import Link from 'next/link'
import type { UserSeries } from '@/lib/books/get-user-series'
import { Card } from '@/components/ui/card'
import { NextVolumeBadge } from '@/features/next-volume/next-volume-badge'
import { StoreBadge } from './store-badge'

interface SeriesCardProps {
  series: UserSeries
}

export function SeriesCard({ series }: SeriesCardProps) {
  return (
    <Link
      href={`/bookshelf/series/${series.seriesId}`}
      aria-label={`${series.title} の巻一覧を開く`}
      className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card interactive className="overflow-hidden">
        <div className="relative aspect-[2/3] bg-muted">
          {series.coverThumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Cloudflare Pages Edge では next/image 最適化が無効化されるため plain <img> を使用
            <img
              src={series.coverThumbnailUrl}
              alt={`${series.title} の書影`}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              No Cover
            </div>
          )}
          <div className="absolute right-2 top-2 flex flex-wrap gap-1">
            {series.stores.map((store) => (
              <StoreBadge key={store} store={store} />
            ))}
          </div>
          <div className="absolute left-2 top-2">
            <NextVolumeBadge info={series.nextVolume} />
          </div>
          <span
            className="absolute bottom-2 left-2 rounded-full bg-secondary/90 px-2 py-0.5 font-mono text-xs font-semibold text-secondary-foreground shadow-glow-secondary backdrop-blur-sm"
            aria-label={`${series.volumeCount} 巻所持`}
          >
            {series.volumeCount} 巻所持
          </span>
        </div>
        <div className="p-3">
          <p
            className="line-clamp-2 text-sm font-medium transition-colors group-hover:text-primary"
            title={series.title}
          >
            {series.title}
          </p>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{series.author}</p>
        </div>
      </Card>
    </Link>
  )
}
