import { render, screen } from '@testing-library/react'
import type { GetBooksResponse, BookWithStore } from '@bookhub/shared'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/books/get-user-books', () => ({
  getUserBooks: vi.fn(),
}))

// BookSearchForm は Client Component のため next/navigation を使う。
// Server Component テストでは描画されればよいので最低限のスタブ化。
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/bookshelf',
  redirect: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getUserBooks } from '@/lib/books/get-user-books'
import BookshelfPage from '../page'

const mockUser = { id: 'user-123', email: 'test@example.com' }

function makeBook(overrides: Partial<BookWithStore> = {}): BookWithStore {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    title: 'Title',
    author: 'Author',
    volumeNumber: 1,
    thumbnailUrl: null,
    isbn: null,
    publishedAt: null,
    isAdult: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    userBookId: '22222222-2222-2222-2222-222222222222',
    store: 'kindle',
    userBookCreatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function setupAuth() {
  vi.mocked(createClient).mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: mockUser }, error: null }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)
}

async function renderPage(searchParams: Record<string, string> = {}) {
  const element = await BookshelfPage({
    searchParams: Promise.resolve(searchParams),
  })
  render(element)
}

describe('BookshelfPage', () => {
  beforeEach(() => {
    setupAuth()
  })

  it('getUserBooks の結果をギャラリーに描画する', async () => {
    const books = [
      makeBook({
        userBookId: '00000000-0000-0000-0000-0000000000a1',
        title: 'ワンピース',
        volumeNumber: 105,
      }),
      makeBook({
        userBookId: '00000000-0000-0000-0000-0000000000a2',
        title: 'NARUTO',
        volumeNumber: 72,
        store: 'dmm',
      }),
    ]
    const response: GetBooksResponse = { books, total: 2, page: 1, limit: 100 }
    vi.mocked(getUserBooks).mockResolvedValue(response)

    await renderPage()

    expect(screen.getByRole('heading', { name: '本棚' })).toBeInTheDocument()
    expect(screen.getByText('2 冊')).toBeInTheDocument()
    expect(screen.getByText('ワンピース (105巻)')).toBeInTheDocument()
    expect(screen.getByText('NARUTO (72巻)')).toBeInTheDocument()
  })

  it('books が空のときは empty state を表示する', async () => {
    vi.mocked(getUserBooks).mockResolvedValue({ books: [], total: 0, page: 1, limit: 100 })

    await renderPage()

    expect(screen.getByText('蔵書がまだありません')).toBeInTheDocument()
  })

  it('searchParams.q が 2 文字以上のとき getUserBooks に q を渡す', async () => {
    vi.mocked(getUserBooks).mockResolvedValue({ books: [], total: 0, page: 1, limit: 100 })

    await renderPage({ q: 'ワンピ' })

    expect(getUserBooks).toHaveBeenCalledWith(
      expect.anything(),
      'user-123',
      expect.objectContaining({ q: 'ワンピ', page: 1, limit: 100 }),
    )
  })

  it('searchParams.q が 1 文字のとき getUserBooks には q を渡さない', async () => {
    vi.mocked(getUserBooks).mockResolvedValue({ books: [], total: 0, page: 1, limit: 100 })

    await renderPage({ q: 'ワ' })

    const call = vi.mocked(getUserBooks).mock.calls[0]
    expect(call?.[2]).not.toHaveProperty('q')
    expect(call?.[2]).toEqual(expect.objectContaining({ page: 1, limit: 100 }))
  })

  it('searchParams.q 2文字以上 & 結果 0 件のとき no-results を表示する', async () => {
    vi.mocked(getUserBooks).mockResolvedValue({ books: [], total: 0, page: 1, limit: 100 })

    await renderPage({ q: 'ワンピ' })

    expect(screen.getByText('検索結果がありません')).toBeInTheDocument()
  })
})
