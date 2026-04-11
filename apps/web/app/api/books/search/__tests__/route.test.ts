import { GET } from '../route'

vi.mock('@/lib/supabase/auth-helper', () => ({
  createClientFromToken: vi.fn(),
}))

vi.mock('@/lib/book-search/book-search-service', () => ({
  searchBooks: vi.fn(),
}))

import { createClientFromToken } from '@/lib/supabase/auth-helper'
import { searchBooks } from '@/lib/book-search/book-search-service'
import type { BookSearchResult } from '@/lib/book-search/types'

const mockUser = { id: 'user-123', email: 'test@example.com' }
const mockSupabase = { from: vi.fn() }

function setupMockAuth() {
  vi.mocked(createClientFromToken).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: mockSupabase as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: mockUser as any,
  })
}

function createGetRequest(params?: Record<string, string>, token?: string) {
  const url = new URL('https://example.com/api/books/search')
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  return new Request(url.toString(), { method: 'GET', headers })
}

describe('GET /api/books/search', () => {
  describe('認証', () => {
    it('Authorization ヘッダーなしで 401 を返す', async () => {
      const request = createGetRequest()
      const response = await GET(request)
      expect(response.status).toBe(401)

      const body = await response.json()
      expect(body.error).toBe('unauthorized')
    })

    it('無効なトークンで 401 を返す', async () => {
      vi.mocked(createClientFromToken).mockResolvedValue(null)
      const request = createGetRequest({ q: 'test' }, 'invalid-token')
      const response = await GET(request)
      expect(response.status).toBe(401)
    })
  })

  describe('バリデーション', () => {
    beforeEach(() => setupMockAuth())

    it('q パラメータなしで 400 を返す', async () => {
      const request = createGetRequest({}, 'valid-token')
      const response = await GET(request)
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toBe('validation_error')
    })

    it('q が空文字で 400 を返す', async () => {
      const request = createGetRequest({ q: '' }, 'valid-token')
      const response = await GET(request)
      expect(response.status).toBe(400)
    })

    it('q が空白のみで 400 を返す', async () => {
      const request = createGetRequest({ q: '   ' }, 'valid-token')
      const response = await GET(request)
      expect(response.status).toBe(400)
    })

    it('page が小数で 400 を返す', async () => {
      const request = createGetRequest({ q: 'test', page: '1.5' }, 'valid-token')
      const response = await GET(request)
      expect(response.status).toBe(400)
    })

    it('page が上限超過で 400 を返す', async () => {
      const request = createGetRequest({ q: 'test', page: '1001' }, 'valid-token')
      const response = await GET(request)
      expect(response.status).toBe(400)
    })
  })

  describe('正常系', () => {
    beforeEach(() => setupMockAuth())

    it('正常な検索で 200 を返す', async () => {
      const mockResult: BookSearchResult = {
        items: [
          {
            title: 'ONE PIECE 107',
            author: '尾田栄一郎',
            isbn: '9784088838625',
            volumeNumber: 107,
            thumbnailUrl: 'https://example.com/img.jpg',
            publishedAt: '2024-03-04',
          },
        ],
        totalCount: 83,
        source: 'rakuten',
        hasMore: true,
      }
      vi.mocked(searchBooks).mockResolvedValue(mockResult)

      const request = createGetRequest({ q: 'ONE PIECE' }, 'valid-token')
      const response = await GET(request)
      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body.items).toHaveLength(1)
      expect(body.source).toBe('rakuten')
      expect(body.totalCount).toBe(83)
    })

    it('クエリパラメータが searchBooks に渡される', async () => {
      const mockResult: BookSearchResult = {
        items: [],
        totalCount: 0,
        source: 'none',
        error: 'no_results',
        hasMore: false,
      }
      vi.mocked(searchBooks).mockResolvedValue(mockResult)

      const request = createGetRequest({ q: 'ワンピース', page: '2', limit: '5' }, 'valid-token')
      await GET(request)

      expect(searchBooks).toHaveBeenCalledWith({
        query: 'ワンピース',
        page: 2,
        limit: 5,
      })
    })
  })

  describe('エラーハンドリング', () => {
    beforeEach(() => setupMockAuth())

    it('searchBooks がエラーを投げた場合 500 を返す', async () => {
      vi.mocked(searchBooks).mockRejectedValue(new Error('Unexpected error'))

      const request = createGetRequest({ q: 'test' }, 'valid-token')
      const response = await GET(request)
      expect(response.status).toBe(500)

      const body = await response.json()
      expect(body.error).toBe('internal_error')
    })

    it('APIキー未設定で 503 を返す（設定情報を漏洩させない）', async () => {
      const mockResult: BookSearchResult = {
        items: [],
        totalCount: 0,
        source: 'none',
        error: 'no_api_keys_configured',
        hasMore: false,
      }
      vi.mocked(searchBooks).mockResolvedValue(mockResult)

      const request = createGetRequest({ q: 'test' }, 'valid-token')
      const response = await GET(request)
      expect(response.status).toBe(503)

      const body = await response.json()
      expect(body.error).toBe('service_unavailable')
      expect(body.message).not.toContain('api_keys')
    })
  })
})
