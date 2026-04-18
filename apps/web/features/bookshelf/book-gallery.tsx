import type { BookWithStore } from '@bookhub/shared'
import { BookCard } from './book-card'
import { EmptyState } from './empty-state'

interface BookGalleryProps {
  books: BookWithStore[]
  isSearching: boolean
}

export function BookGallery({ books, isSearching }: BookGalleryProps) {
  if (books.length === 0) {
    return <EmptyState variant={isSearching ? 'no-results' : 'empty'} />
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
