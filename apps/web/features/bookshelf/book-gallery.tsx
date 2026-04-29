import type { ReactNode } from 'react'
import type { BookWithStore } from '@bookhub/shared'
import { BookCard } from './book-card'

interface BookGalleryProps {
  books: BookWithStore[]
  /**
   * books が 0 件のときに表示する fallback。省略時は何も描画しない。
   * 「蔵書 0 件」「検索結果 0 件」など empty 時の意味は呼出側ごとに違うため、
   * EmptyState の variant 判定を内部に持たず外部に委ねる設計。
   */
  emptyFallback?: ReactNode
}

export function BookGallery({ books, emptyFallback }: BookGalleryProps) {
  if (books.length === 0) {
    return <>{emptyFallback ?? null}</>
  }

  return (
    <ul
      aria-label="蔵書一覧"
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
    >
      {books.map((book) => (
        <li key={book.userBookId}>
          <BookCard book={book} />
        </li>
      ))}
    </ul>
  )
}
