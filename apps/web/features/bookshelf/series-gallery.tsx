import type { ReactNode } from 'react'
import type { UserSeries } from '@/lib/books/get-user-series'
import { SeriesCard } from './series-card'

interface SeriesGalleryProps {
  series: UserSeries[]
  /**
   * series が 0 件のときに表示する fallback。省略時は何も描画しない。
   */
  emptyFallback?: ReactNode
}

export function SeriesGallery({ series, emptyFallback }: SeriesGalleryProps) {
  if (series.length === 0) {
    return <>{emptyFallback ?? null}</>
  }

  return (
    <ul
      aria-label="シリーズ一覧"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
    >
      {series.map((s) => (
        <li key={s.seriesId}>
          <SeriesCard series={s} />
        </li>
      ))}
    </ul>
  )
}
