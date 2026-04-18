import { render, screen } from '@testing-library/react'
import type { BookWithStore } from '@bookhub/shared'
import { BookCard } from '../book-card'

const baseBook: BookWithStore = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'ワンピース',
  author: '尾田栄一郎',
  volumeNumber: 105,
  thumbnailUrl: 'https://m.media-amazon.com/images/I/abc.jpg',
  isbn: '9784088831234',
  publishedAt: '2023-03-03',
  isAdult: false,
  createdAt: '2024-01-01T00:00:00.000Z',
  userBookId: '22222222-2222-2222-2222-222222222222',
  store: 'kindle',
  storeProductId: 'B0ABCDEFGH',
  userBookCreatedAt: '2024-01-01T00:00:00.000Z',
}

describe('BookCard', () => {
  it('タイトルに巻数を併記して表示する', () => {
    render(<BookCard book={baseBook} />)
    expect(screen.getByText('ワンピース (105巻)')).toBeInTheDocument()
  })

  it('著者名を表示する', () => {
    render(<BookCard book={baseBook} />)
    expect(screen.getByText('尾田栄一郎')).toBeInTheDocument()
  })

  it('巻数が null のときはタイトルのみ表示する', () => {
    render(<BookCard book={{ ...baseBook, volumeNumber: null }} />)
    expect(screen.getByText('ワンピース')).toBeInTheDocument()
    expect(screen.queryByText(/巻\)/)).not.toBeInTheDocument()
  })

  it('thumbnailUrl があるときは img を表示する', () => {
    render(<BookCard book={baseBook} />)
    const img = screen.getByRole('img', { name: /ワンピース の書影/ })
    expect(img).toHaveAttribute('src', 'https://m.media-amazon.com/images/I/abc.jpg')
    expect(img).toHaveAttribute('loading', 'lazy')
  })

  it('thumbnailUrl が null のときはプレースホルダーを表示する', () => {
    render(<BookCard book={{ ...baseBook, thumbnailUrl: null }} />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByText('No Cover')).toBeInTheDocument()
  })

  it('購入ストアのバッジを表示する', () => {
    render(<BookCard book={baseBook} />)
    expect(screen.getByLabelText('購入ストア: Kindle')).toBeInTheDocument()
  })

  it('DMM の書籍は DMM バッジを表示する', () => {
    render(<BookCard book={{ ...baseBook, store: 'dmm' }} />)
    expect(screen.getByLabelText('購入ストア: DMM')).toBeInTheDocument()
  })

  describe('ストア商品ページへのリンク (#32)', () => {
    it('Kindle + storeProductId ありで Amazon Cloud Reader へのリンクになる', () => {
      render(<BookCard book={baseBook} />)
      const link = screen.getByRole('link', { name: /ワンピース/ })
      expect(link).toHaveAttribute('href', 'https://read.amazon.co.jp/manga/B0ABCDEFGH')
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    })

    it('DMM + storeProductId ありで DMM 商品ページへのリンクになる', () => {
      render(<BookCard book={{ ...baseBook, store: 'dmm', storeProductId: 'abc123' }} />)
      const link = screen.getByRole('link', { name: /ワンピース/ })
      expect(link).toHaveAttribute('href', 'https://book.dmm.com/product/abc123/')
    })

    it('storeProductId が null のときはリンクにならない', () => {
      render(<BookCard book={{ ...baseBook, storeProductId: null }} />)
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
      // タイトルはそのまま表示される
      expect(screen.getByText('ワンピース (105巻)')).toBeInTheDocument()
    })

    it('store=other のときはリンクにならない', () => {
      render(<BookCard book={{ ...baseBook, store: 'other' }} />)
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })
  })
})
