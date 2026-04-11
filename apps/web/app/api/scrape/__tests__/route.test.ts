import { POST, OPTIONS } from '../route'

vi.mock('@/lib/supabase/auth-helper', () => ({
  createClientFromToken: vi.fn(),
}))

vi.mock('@/lib/scrape/process-scrape', () => ({
  processScrapePayload: vi.fn(),
}))

import { createClientFromToken } from '@/lib/supabase/auth-helper'
import { processScrapePayload } from '@/lib/scrape/process-scrape'

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

const validPayload = {
  books: [
    {
      title: 'ワンピース',
      author: '尾田栄一郎',
      volumeNumber: 107,
      store: 'kindle',
      isAdult: false,
    },
  ],
}

function createRequest(body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  return new Request('https://example.com/api/scrape', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

describe('POST /api/scrape', () => {
  describe('認証', () => {
    it('Authorization ヘッダーなしで 401 を返す', async () => {
      const request = createRequest(validPayload)
      const response = await POST(request)
      expect(response.status).toBe(401)

      const body = await response.json()
      expect(body.error).toBe('unauthorized')
    })

    it('無効なトークンで 401 を返す', async () => {
      vi.mocked(createClientFromToken).mockResolvedValue(null)
      const request = createRequest(validPayload, 'invalid-token')
      const response = await POST(request)
      expect(response.status).toBe(401)

      const body = await response.json()
      expect(body.error).toBe('unauthorized')
    })
  })

  describe('バリデーション', () => {
    beforeEach(() => {
      setupMockAuth()
    })

    it('不正な JSON で 400 を返す', async () => {
      const request = new Request('https://example.com/api/scrape', {
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
      const request = createRequest({ books: [] }, 'valid-token')
      const response = await POST(request)
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toBe('validation_error')
    })
  })

  describe('正常系', () => {
    beforeEach(() => {
      setupMockAuth()
    })

    it('正常なリクエストで 200 とレスポンスを返す', async () => {
      const mockResult = {
        savedCount: 1,
        duplicateCount: 0,
        duplicates: [],
      }
      vi.mocked(processScrapePayload).mockResolvedValue(mockResult)

      const request = createRequest(validPayload, 'valid-token')
      const response = await POST(request)
      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body).toEqual(mockResult)
    })

    it('processScrapePayload に正しい引数が渡される', async () => {
      vi.mocked(processScrapePayload).mockResolvedValue({
        savedCount: 0,
        duplicateCount: 0,
        duplicates: [],
      })

      const request = createRequest(validPayload, 'valid-token')
      await POST(request)

      expect(processScrapePayload).toHaveBeenCalledWith(
        mockSupabase,
        'user-123',
        validPayload.books,
      )
    })
  })

  describe('エラーハンドリング', () => {
    beforeEach(() => {
      setupMockAuth()
    })

    it('processScrapePayload がエラーを投げた場合 500 を返す', async () => {
      vi.mocked(processScrapePayload).mockRejectedValue(new Error('DB error'))

      const request = createRequest(validPayload, 'valid-token')
      const response = await POST(request)
      expect(response.status).toBe(500)

      const body = await response.json()
      expect(body.error).toBe('internal_error')
    })
  })
})

describe('OPTIONS /api/scrape', () => {
  it('CORS プリフライトに正しいヘッダーを返す', async () => {
    const response = await OPTIONS()
    expect(response.status).toBe(204)
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('POST, OPTIONS')
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe('Authorization, Content-Type')
  })
})
