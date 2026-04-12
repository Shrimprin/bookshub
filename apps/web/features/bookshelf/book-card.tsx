import type { BookWithStore } from '@bookhub/shared'
import { Card } from '@/components/ui/card'
import { StoreBadge } from './store-badge'

interface BookCardProps {
  book: BookWithStore
}

export function BookCard({ book }: BookCardProps) {
  const titleWithVolume = book.volumeNumber ? `${book.title} (${book.volumeNumber}巻)` : book.title

  return (
    <Card className="overflow-hidden">
      <div className="relative aspect-[2/3] bg-muted">
        {book.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- Cloudflare Pages Edge では next/image 最適化が無効化されるため plain <img> を使用
          <img
            src={book.thumbnailUrl}
            alt={`${book.title} の書影`}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No Cover
          </div>
        )}
        <StoreBadge store={book.store} className="absolute right-2 top-2" />
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-medium" title={titleWithVolume}>
          {titleWithVolume}
        </p>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{book.author}</p>
      </div>
    </Card>
  )
}
