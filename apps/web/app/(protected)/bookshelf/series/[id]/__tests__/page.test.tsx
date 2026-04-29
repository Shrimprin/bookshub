import { render, screen } from '@testing-library/react'
import type { BookWithStore } from '@bookhub/shared'
import type { SeriesDetail } from '@/lib/books/get-series-detail'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/books/get-series-detail', () => ({
  getSeriesDetail: vi.fn(),
}))

const notFoundMock = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND')
})
const redirectMock = vi.fn(() => {
  throw new Error('NEXT_REDIRECT')
})

vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  redirect: () => redirectMock(),
}))

import { createClient } from '@/lib/supabase/server'
import { getSeriesDetail } from '@/lib/books/get-series-detail'
import SeriesDetailPage from '../page'

const mockUser = { id: 'user-123', email: 'test@example.com' }
const validSeriesId = '11111111-1111-1111-1111-111111111111'

function makeVolume(overrides: Partial<BookWithStore> = {}): BookWithStore {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    title: 'ワンピース',
    author: '尾田栄一郎',
    volumeNumber: 1,
    thumbnailUrl: null,
    isbn: null,
    publishedAt: null,
    isAdult: false,
    createdAt: '2024-01-01T00:00:00Z',
    userBookId: 'ub-1',
    store: 'kindle',
    storeProductId: 'B0ABC',
    userBookCreatedAt: '2024-01-01T00:00:00Z',
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

async function renderPage(
  params: Record<string, string> = { id: validSeriesId },
  searchParams: Record<string, string> = {},
) {
  const element = await SeriesDetailPage({
    params: Promise.resolve(params),
    searchParams: Promise.resolve(searchParams),
  })
  render(element)
}

describe('SeriesDetailPage', () => {
  beforeEach(() => {
    setupAuth()
    notFoundMock.mockClear()
    redirectMock.mockClear()
  })

  it('正常系: シリーズ名・著者・巻数 + 巻ギャラリーを描画する', async () => {
    const detail: SeriesDetail = {
      series: { id: validSeriesId, title: 'ワンピース', author: '尾田栄一郎' },
      volumes: [
        makeVolume({ id: 'b1', userBookId: 'ub1', volumeNumber: 1 }),
        makeVolume({ id: 'b2', userBookId: 'ub2', volumeNumber: 2 }),
      ],
    }
    vi.mocked(getSeriesDetail).mockResolvedValue(detail)

    await renderPage()

    expect(screen.getByRole('heading', { name: 'ワンピース' })).toBeInTheDocument()
    expect(screen.getByText(/尾田栄一郎.*2 巻所持/)).toBeInTheDocument()
    expect(screen.getByText('ワンピース (1巻)')).toBeInTheDocument()
    expect(screen.getByText('ワンピース (2巻)')).toBeInTheDocument()
  })

  it('Breadcrumb の「本棚」リンクは searchParams.q を保持する', async () => {
    vi.mocked(getSeriesDetail).mockResolvedValue({
      series: { id: validSeriesId, title: 'ワンピース', author: '尾田' },
      volumes: [makeVolume()],
    })

    await renderPage({ id: validSeriesId }, { q: 'ワンピ' })

    const link = screen.getByRole('link', { name: '本棚' })
    expect(link.getAttribute('href')).toBe('/bookshelf?q=' + encodeURIComponent('ワンピ'))
  })

  it('searchParams.q が無い場合は /bookshelf に戻る', async () => {
    vi.mocked(getSeriesDetail).mockResolvedValue({
      series: { id: validSeriesId, title: 'ワンピース', author: '尾田' },
      volumes: [makeVolume()],
    })

    await renderPage()

    const link = screen.getByRole('link', { name: '本棚' })
    expect(link.getAttribute('href')).toBe('/bookshelf')
  })

  it('UUID 形式でない id は notFound() を呼ぶ', async () => {
    await expect(renderPage({ id: 'not-a-uuid' })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
    expect(getSeriesDetail).not.toHaveBeenCalled()
  })

  it('getSeriesDetail が null を返した場合 notFound() を呼ぶ (他ユーザーの series / 存在しない)', async () => {
    vi.mocked(getSeriesDetail).mockResolvedValue(null)

    await expect(renderPage()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(notFoundMock).toHaveBeenCalled()
  })

  it('未ログインの場合 redirect("/login") を呼ぶ', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    await expect(renderPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(redirectMock).toHaveBeenCalled()
  })

  it('getSeriesDetail には auth user.id と parsed seriesId を渡す', async () => {
    vi.mocked(getSeriesDetail).mockResolvedValue({
      series: { id: validSeriesId, title: 'ワンピース', author: '尾田' },
      volumes: [makeVolume()],
    })

    await renderPage()

    expect(getSeriesDetail).toHaveBeenCalledWith(expect.anything(), 'user-123', validSeriesId)
  })
})
