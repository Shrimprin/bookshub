import { GET, POST } from '../route'

vi.mock('@/lib/supabase/auth-helper', () => ({
  createClientFromToken: vi.fn(),
}))

vi.mock('@/lib/books/get-user-books', () => ({
  getUserBooks: vi.fn(),
}))

vi.mock('@/lib/books/register-book', () => ({
  registerBook: vi.fn(),
}))

import { createClientFromToken } from '@/lib/supabase/auth-helper'
import { getUserBooks } from '@/lib/books/get-user-books'
import { registerBook } from '@/lib/books/register-book'

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
  const url = new URL('https://example.com/api/books')
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value)
    }
  }
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  return new Request(url.toString(), { method: 'GET', headers })
}

function createPostRequest(body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  return new Request('https://example.com/api/books', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

// --- GET /api/books ---

describe('GET /api/books', () => {
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
      const request = createGetRequest({}, 'invalid-token')
      const response = await GET(request)
      expect(response.status).toBe(401)
    })
  })

  describe('バリデーション', () => {
    beforeEach(() => setupMockAuth())

    it('q が 1 文字で 400 を返す', async () => {
      const request = createGetRequest({ q: 'A' }, 'valid-token')
      const response = await GET(request)
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toBe('validation_error')
    })

    it('無効な store で 400 を返す', async () => {
      const request = createGetRequest({ store: 'kobo' }, 'valid-token')
      const response = await GET(request)
      expect(response.status).toBe(400)
    })
  })

  describe('正常系', () => {
    beforeEach(() => setupMockAuth())

    it('正常なリクエストで 200 を返す', async () => {
      const mockResult = { books: [], total: 0, page: 1, limit: 20 }
      vi.mocked(getUserBooks).mockResolvedValue(mockResult)

      const request = createGetRequest({}, 'valid-token')
      const response = await GET(request)
      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body).toEqual(mockResult)
    })

    it('クエリパラメータが getUserBooks に渡される', async () => {
      vi.mocked(getUserBooks).mockResolvedValue({ books: [], total: 0, page: 2, limit: 10 })

      const request = createGetRequest({ q: 'ワンピ', page: '2', limit: '10' }, 'valid-token')
      await GET(request)

      expect(getUserBooks).toHaveBeenCalledWith(mockSupabase, 'user-123', {
        q: 'ワンピ',
        page: 2,
        limit: 10,
      })
    })
  })

  describe('エラーハンドリング', () => {
    beforeEach(() => setupMockAuth())

    it('getUserBooks がエラーを投げた場合 500 を返す', async () => {
      vi.mocked(getUserBooks).mockRejectedValue(new Error('DB error'))

      const request = createGetRequest({}, 'valid-token')
      const response = await GET(request)
      expect(response.status).toBe(500)

      const body = await response.json()
      expect(body.error).toBe('internal_error')
    })
  })
})

// --- POST /api/books ---

describe('POST /api/books', () => {
  const validPayload = {
    title: 'ワンピース',
    author: '尾田栄一郎',
    volumeNumber: 107,
    store: 'kindle',
    isAdult: false,
  }

  describe('認証', () => {
    it('Authorization ヘッダーなしで 401 を返す', async () => {
      const request = createPostRequest(validPayload)
      const response = await POST(request)
      expect(response.status).toBe(401)
    })
  })

  describe('バリデーション', () => {
    beforeEach(() => setupMockAuth())

    it('不正な JSON で 400 を返す', async () => {
      const request = new Request('https://example.com/api/books', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer valid-token',
        },
        body: 'not-json',
      })
      const response = await POST(request)
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toBe('invalid_json')
    })

    it('Zod バリデーション失敗で 400 を返す', async () => {
      const request = createPostRequest({ title: '' }, 'valid-token')
      const response = await POST(request)
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toBe('validation_error')
    })
  })

  describe('正常系', () => {
    beforeEach(() => setupMockAuth())

    it('正常なリクエストで 201 を返す', async () => {
      const mockResult = {
        book: {
          id: 'book-1',
          title: 'ワンピース',
          author: '尾田栄一郎',
          volumeNumber: 107,
          thumbnailUrl: null,
          isbn: null,
          publishedAt: null,
          isAdult: false,
          createdAt: '2024-01-01T00:00:00Z',
          userBookId: 'ub-1',
          store: 'kindle',
          userBookCreatedAt: '2024-01-01T00:00:00Z',
        },
        alreadyOwned: false,
        existingStores: [],
      }
      vi.mocked(registerBook).mockResolvedValue(mockResult)

      const request = createPostRequest(validPayload, 'valid-token')
      const response = await POST(request)
      expect(response.status).toBe(201)
    })
  })

  describe('重複', () => {
    beforeEach(() => setupMockAuth())

    it('conflict エラーで 409 を返す', async () => {
      vi.mocked(registerBook).mockResolvedValue({
        error: 'conflict',
        message: 'Already registered',
      })

      const request = createPostRequest(validPayload, 'valid-token')
      const response = await POST(request)
      expect(response.status).toBe(409)

      const body = await response.json()
      expect(body.error).toBe('conflict')
    })
  })

  describe('エラーハンドリング', () => {
    beforeEach(() => setupMockAuth())

    it('registerBook がエラーを投げた場合 500 を返す', async () => {
      vi.mocked(registerBook).mockRejectedValue(new Error('DB error'))

      const request = createPostRequest(validPayload, 'valid-token')
      const response = await POST(request)
      expect(response.status).toBe(500)
    })
  })
})
