import { render, screen } from '@testing-library/react'
import type { GetUserSeriesResult, UserSeries } from '@/lib/books/get-user-series'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/books/get-user-series', () => ({
  getUserSeries: vi.fn(),
}))

// BookSearchForm は Client Component のため next/navigation を使う。
// Server Component テストでは描画されればよいので最低限のスタブ化。
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => '/bookshelf',
  redirect: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getUserSeries } from '@/lib/books/get-user-series'
import BookshelfPage from '../page'

const mockUser = { id: 'user-123', email: 'test@example.com' }

function makeSeries(overrides: Partial<UserSeries> = {}): UserSeries {
  return {
    seriesId: '11111111-1111-1111-1111-111111111111',
    title: 'シリーズ',
    author: '著者',
    volumeCount: 10,
    coverThumbnailUrl: null,
    stores: ['kindle'],
    lastAddedAt: '2024-01-01T00:00:00.000Z',
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

  it('getUserSeries の結果をシリーズギャラリーに描画する', async () => {
    const series = [
      makeSeries({ seriesId: 's-1', title: 'ワンピース', author: '尾田栄一郎', volumeCount: 105 }),
      makeSeries({ seriesId: 's-2', title: 'NARUTO', author: '岸本斉史', volumeCount: 72 }),
    ]
    const response: GetUserSeriesResult = { series, total: 2, page: 1, limit: 100 }
    vi.mocked(getUserSeries).mockResolvedValue(response)

    await renderPage()

    expect(screen.getByRole('heading', { name: '本棚' })).toBeInTheDocument()
    expect(screen.getByText('2 シリーズ')).toBeInTheDocument()
    expect(screen.getByText('ワンピース')).toBeInTheDocument()
    expect(screen.getByText('NARUTO')).toBeInTheDocument()
    expect(screen.getByText('105 巻所持')).toBeInTheDocument()
    expect(screen.getByText('72 巻所持')).toBeInTheDocument()
  })

  it('series が空のときは empty state を表示する', async () => {
    vi.mocked(getUserSeries).mockResolvedValue({ series: [], total: 0, page: 1, limit: 100 })

    await renderPage()

    expect(screen.getByText('蔵書がまだありません')).toBeInTheDocument()
  })

  it('searchParams.q が 2 文字以上のとき getUserSeries に q を渡す', async () => {
    vi.mocked(getUserSeries).mockResolvedValue({ series: [], total: 0, page: 1, limit: 100 })

    await renderPage({ q: 'ワンピ' })

    expect(getUserSeries).toHaveBeenCalledWith(
      expect.anything(),
      'user-123',
      expect.objectContaining({ q: 'ワンピ', page: 1, limit: 100 }),
    )
  })

  it('searchParams.q が 1 文字のとき getUserSeries には q を渡さない', async () => {
    vi.mocked(getUserSeries).mockResolvedValue({ series: [], total: 0, page: 1, limit: 100 })

    await renderPage({ q: 'ワ' })

    const call = vi.mocked(getUserSeries).mock.calls[0]
    expect(call?.[2]).not.toHaveProperty('q')
    expect(call?.[2]).toEqual(expect.objectContaining({ page: 1, limit: 100 }))
  })

  it('searchParams.q が空文字列のとき getUserSeries には q を渡さない', async () => {
    vi.mocked(getUserSeries).mockResolvedValue({ series: [], total: 0, page: 1, limit: 100 })

    await renderPage({ q: '' })

    const call = vi.mocked(getUserSeries).mock.calls[0]
    expect(call?.[2]).not.toHaveProperty('q')
  })

  it('searchParams.q が空白のみのとき getUserSeries には q を渡さない', async () => {
    vi.mocked(getUserSeries).mockResolvedValue({ series: [], total: 0, page: 1, limit: 100 })

    await renderPage({ q: '   ' })

    const call = vi.mocked(getUserSeries).mock.calls[0]
    expect(call?.[2]).not.toHaveProperty('q')
  })

  it('searchParams.q が 200 文字を超える場合は 200 文字に切り詰めて getUserSeries に渡す', async () => {
    vi.mocked(getUserSeries).mockResolvedValue({ series: [], total: 0, page: 1, limit: 100 })

    const longQ = 'あ'.repeat(500)
    await renderPage({ q: longQ })

    const call = vi.mocked(getUserSeries).mock.calls[0]
    const passedQ = (call?.[2] as { q?: string }).q
    expect(passedQ?.length).toBe(200)
    expect(passedQ).toBe('あ'.repeat(200))
  })

  it('searchParams.q 2文字以上 & 結果 0 件のとき no-results を表示する', async () => {
    vi.mocked(getUserSeries).mockResolvedValue({ series: [], total: 0, page: 1, limit: 100 })

    await renderPage({ q: 'ワンピ' })

    expect(screen.getByText('検索結果がありません')).toBeInTheDocument()
  })
})
