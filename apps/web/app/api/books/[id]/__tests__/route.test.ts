import { PATCH, DELETE } from '../route'

vi.mock('@/lib/supabase/auth-helper', () => ({
  createClientFromToken: vi.fn(),
}))

vi.mock('@/lib/books/update-user-book', () => ({
  updateUserBook: vi.fn(),
}))

vi.mock('@/lib/books/delete-user-book', () => ({
  deleteUserBook: vi.fn(),
}))

import { createClientFromToken } from '@/lib/supabase/auth-helper'
import { updateUserBook } from '@/lib/books/update-user-book'
import { deleteUserBook } from '@/lib/books/delete-user-book'

const mockUser = { id: 'user-123', email: 'test@example.com' }
const mockSupabase = { from: vi.fn() }
const validUuid = '550e8400-e29b-41d4-a716-446655440000'

function setupMockAuth() {
  vi.mocked(createClientFromToken).mockResolvedValue({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: mockSupabase as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    user: mockUser as any,
  })
}

function createPatchRequest(body: unknown, token?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  return new Request(`https://example.com/api/books/${validUuid}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  })
}

function createDeleteRequest(token?: string) {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  return new Request(`https://example.com/api/books/${validUuid}`, {
    method: 'DELETE',
    headers,
  })
}

function createParams(id: string) {
  return Promise.resolve({ id })
}

// --- PATCH /api/books/[id] ---

describe('PATCH /api/books/[id]', () => {
  describe('認証', () => {
    it('Authorization ヘッダーなしで 401 を返す', async () => {
      const request = createPatchRequest({ store: 'dmm' })
      const response = await PATCH(request, { params: createParams(validUuid) })
      expect(response.status).toBe(401)
    })
  })

  describe('バリデーション', () => {
    beforeEach(() => setupMockAuth())

    it('無効な UUID で 400 を返す', async () => {
      const request = createPatchRequest({ store: 'dmm' }, 'valid-token')
      const response = await PATCH(request, { params: createParams('not-a-uuid') })
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toBe('invalid_uuid')
    })

    it('無効な store で 400 を返す', async () => {
      const request = createPatchRequest({ store: 'kobo' }, 'valid-token')
      const response = await PATCH(request, { params: createParams(validUuid) })
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toBe('validation_error')
    })
  })

  describe('正常系', () => {
    beforeEach(() => setupMockAuth())

    it('正常なリクエストで 200 を返す', async () => {
      const mockResult = {
        id: 'book-1',
        title: 'ワンピース',
        author: '尾田栄一郎',
        volumeNumber: 107,
        thumbnailUrl: null,
        isbn: null,
        publishedAt: null,
        isAdult: false,
        createdAt: '2024-01-01T00:00:00Z',
        userBookId: validUuid,
        store: 'dmm' as const,
        userBookCreatedAt: '2024-01-01T00:00:00Z',
      }
      vi.mocked(updateUserBook).mockResolvedValue(mockResult)

      const request = createPatchRequest({ store: 'dmm' }, 'valid-token')
      const response = await PATCH(request, { params: createParams(validUuid) })
      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body.store).toBe('dmm')
    })
  })

  describe('not_found', () => {
    beforeEach(() => setupMockAuth())

    it('存在しないレコードで 404 を返す', async () => {
      vi.mocked(updateUserBook).mockResolvedValue({
        error: 'not_found',
        message: 'Not found',
      })

      const request = createPatchRequest({ store: 'dmm' }, 'valid-token')
      const response = await PATCH(request, { params: createParams(validUuid) })
      expect(response.status).toBe(404)

      const body = await response.json()
      expect(body.error).toBe('not_found')
    })
  })
})

// --- DELETE /api/books/[id] ---

describe('DELETE /api/books/[id]', () => {
  describe('認証', () => {
    it('Authorization ヘッダーなしで 401 を返す', async () => {
      const request = createDeleteRequest()
      const response = await DELETE(request, { params: createParams(validUuid) })
      expect(response.status).toBe(401)
    })
  })

  describe('バリデーション', () => {
    beforeEach(() => setupMockAuth())

    it('無効な UUID で 400 を返す', async () => {
      const request = createDeleteRequest('valid-token')
      const response = await DELETE(request, { params: createParams('not-a-uuid') })
      expect(response.status).toBe(400)

      const body = await response.json()
      expect(body.error).toBe('invalid_uuid')
    })
  })

  describe('正常系', () => {
    beforeEach(() => setupMockAuth())

    it('正常なリクエストで 200 を返す', async () => {
      vi.mocked(deleteUserBook).mockResolvedValue({ message: 'Deleted' })

      const request = createDeleteRequest('valid-token')
      const response = await DELETE(request, { params: createParams(validUuid) })
      expect(response.status).toBe(200)

      const body = await response.json()
      expect(body.message).toBe('Deleted')
    })
  })

  describe('not_found', () => {
    beforeEach(() => setupMockAuth())

    it('存在しないレコードで 404 を返す', async () => {
      vi.mocked(deleteUserBook).mockResolvedValue({
        error: 'not_found',
        message: 'Not found',
      })

      const request = createDeleteRequest('valid-token')
      const response = await DELETE(request, { params: createParams(validUuid) })
      expect(response.status).toBe(404)
    })
  })
})
