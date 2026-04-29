import { render, screen } from '@testing-library/react'
import type { BookWithStore } from '@bookhub/shared'
import { BookGallery } from '../book-gallery'

function makeBook(overrides: Partial<BookWithStore> = {}): BookWithStore {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Title',
    author: 'Author',
    volumeNumber: 1,
    thumbnailUrl: 'https://m.media-amazon.com/images/I/abc.jpg',
    isbn: '9784088831234',
    publishedAt: '2023-03-03',
    isAdult: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    userBookId: '22222222-2222-2222-2222-222222222222',
    store: 'kindle',
    userBookCreatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('BookGallery', () => {
  it('渡された本を全て描画する', () => {
    const books = [
      makeBook({
        id: '00000000-0000-0000-0000-000000000001',
        userBookId: '00000000-0000-0000-0000-0000000000a1',
        title: '本A',
      }),
      makeBook({
        id: '00000000-0000-0000-0000-000000000002',
        userBookId: '00000000-0000-0000-0000-0000000000a2',
        title: '本B',
      }),
    ]
    render(<BookGallery books={books} />)
    expect(screen.getByText(/本A/)).toBeInTheDocument()
    expect(screen.getByText(/本B/)).toBeInTheDocument()
  })

  it('books 空配列で emptyFallback が渡された場合はそれを描画する', () => {
    render(<BookGallery books={[]} emptyFallback={<p>該当なし</p>} />)
    expect(screen.getByText('該当なし')).toBeInTheDocument()
  })

  it('books 空配列で emptyFallback が無い場合は何も描画しない', () => {
    const { container } = render(<BookGallery books={[]} />)
    expect(container.textContent).toBe('')
  })

  it('books があるとき grid レイアウトの ul を描画する', () => {
    const books = [makeBook()]
    render(<BookGallery books={books} />)
    const list = screen.getByRole('list', { name: /蔵書一覧/ })
    expect(list.className).toContain('grid')
  })
})
