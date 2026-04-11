import { createServerClient } from '@supabase/ssr'
import { type NextRequest } from 'next/server'
import { updateSession } from '../middleware'

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}))

vi.mock('next/server', () => {
  function makeCookieStore() {
    const cookies = new Map<string, { name: string; value: string; options?: unknown }>()
    return {
      set(
        nameOrCookie: string | { name: string; value: string; options?: unknown },
        value?: string,
        options?: unknown,
      ) {
        if (typeof nameOrCookie === 'object') {
          cookies.set(nameOrCookie.name, nameOrCookie)
        } else {
          cookies.set(nameOrCookie, { name: nameOrCookie, value: value!, options })
        }
      },
      getAll() {
        return Array.from(cookies.values())
      },
    }
  }

  const NextResponse = {
    next: vi.fn((_opts?: unknown) => ({
      cookies: makeCookieStore(),
      _type: 'next',
    })),
    redirect: vi.fn((url: URL) => ({
      cookies: makeCookieStore(),
      _type: 'redirect',
      _url: url.toString(),
    })),
    json: vi.fn((body: unknown, init?: { status?: number }) => ({
      cookies: makeCookieStore(),
      _type: 'json',
      _body: body,
      _status: init?.status,
    })),
  }

  return { NextResponse }
})

// --- Helpers ---

function createMockRequest(pathname: string) {
  const url = new URL(`http://localhost:3000${pathname}`)
  const cookieStore = new Map<string, string>()

  return {
    cookies: {
      getAll: () => Array.from(cookieStore.entries()).map(([name, value]) => ({ name, value })),
      set: (name: string, value: string) => cookieStore.set(name, value),
    },
    nextUrl: {
      pathname,
      clone: () => new URL(url),
    },
  } as unknown as NextRequest
}

function setupMockAuth(user: { id: string; email: string } | null) {
  const mockGetUser = vi.fn().mockResolvedValue({ data: { user } })
  vi.mocked(createServerClient).mockReturnValue({
    auth: { getUser: mockGetUser },
  } as unknown as ReturnType<typeof createServerClient>)
  return { mockGetUser }
}

// --- Tests ---

describe('updateSession', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
  })

  describe('未認証ユーザー', () => {
    beforeEach(() => {
      setupMockAuth(null)
    })

    describe('公開パスへのアクセス（pass-through）', () => {
      it.each(['/', '/login', '/signup'])('%s はそのまま通過する', async (pathname) => {
        const request = createMockRequest(pathname)
        const response = await updateSession(request)
        expect((response as unknown as { _type: string })._type).toBe('next')
      })

      it('/auth/callback はそのまま通過する', async () => {
        const request = createMockRequest('/auth/callback')
        const response = await updateSession(request)
        expect((response as unknown as { _type: string })._type).toBe('next')
      })

      it('/auth/confirm はそのまま通過する', async () => {
        const request = createMockRequest('/auth/confirm')
        const response = await updateSession(request)
        expect((response as unknown as { _type: string })._type).toBe('next')
      })
    })

    describe('保護ルートへのアクセス（リダイレクト）', () => {
      it('/bookshelf は /login へリダイレクトする', async () => {
        const request = createMockRequest('/bookshelf')
        const response = await updateSession(request)
        const res = response as unknown as { _type: string; _url: string }
        expect(res._type).toBe('redirect')
        expect(res._url).toContain('/login')
      })

      it('/settings は /login へリダイレクトする', async () => {
        const request = createMockRequest('/settings')
        const response = await updateSession(request)
        const res = response as unknown as { _type: string; _url: string }
        expect(res._type).toBe('redirect')
        expect(res._url).toContain('/login')
      })
    })

    describe('API ルートへのアクセス（401）', () => {
      it('/api/books は 401 JSON を返す', async () => {
        const request = createMockRequest('/api/books')
        const response = await updateSession(request)
        const res = response as unknown as {
          _type: string
          _body: { error: string }
          _status: number
        }
        expect(res._type).toBe('json')
        expect(res._body).toEqual({ error: 'Unauthorized' })
        expect(res._status).toBe(401)
      })

      it('/api/nested/route は 401 JSON を返す', async () => {
        const request = createMockRequest('/api/nested/route')
        const response = await updateSession(request)
        const res = response as unknown as { _type: string; _status: number }
        expect(res._type).toBe('json')
        expect(res._status).toBe(401)
      })
    })
  })

  describe('認証済みユーザー', () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }

    beforeEach(() => {
      setupMockAuth(mockUser)
    })

    describe('ログインページからのリダイレクト', () => {
      it('/login は /bookshelf へリダイレクトする', async () => {
        const request = createMockRequest('/login')
        const response = await updateSession(request)
        const res = response as unknown as { _type: string; _url: string }
        expect(res._type).toBe('redirect')
        expect(res._url).toContain('/bookshelf')
      })

      it('/signup は /bookshelf へリダイレクトする', async () => {
        const request = createMockRequest('/signup')
        const response = await updateSession(request)
        const res = response as unknown as { _type: string; _url: string }
        expect(res._type).toBe('redirect')
        expect(res._url).toContain('/bookshelf')
      })
    })

    describe('通常のページアクセス（pass-through）', () => {
      it.each(['/', '/bookshelf', '/settings'])('%s はそのまま通過する', async (pathname) => {
        const request = createMockRequest(pathname)
        const response = await updateSession(request)
        expect((response as unknown as { _type: string })._type).toBe('next')
      })
    })
  })

  describe('Cookie 伝播', () => {
    it('リダイレクト時に Cookie が伝播される', async () => {
      vi.mocked(createServerClient).mockImplementation((_url, _key, config) => {
        const cookies = (
          config as {
            cookies: {
              setAll: (c: Array<{ name: string; value: string; options?: unknown }>) => void
            }
          }
        ).cookies
        cookies.setAll([{ name: 'sb-token', value: 'refreshed', options: { path: '/' } }])
        return {
          auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
        } as unknown as ReturnType<typeof createServerClient>
      })

      const request = createMockRequest('/bookshelf')
      const response = await updateSession(request)
      const res = response as unknown as {
        _type: string
        cookies: { getAll: () => Array<{ name: string; value: string }> }
      }
      expect(res._type).toBe('redirect')

      const responseCookies = res.cookies.getAll()
      expect(responseCookies.some((c) => c.name === 'sb-token')).toBe(true)
    })

    it('401 レスポンス時に Cookie が伝播される', async () => {
      vi.mocked(createServerClient).mockImplementation((_url, _key, config) => {
        const cookies = (
          config as {
            cookies: {
              setAll: (c: Array<{ name: string; value: string; options?: unknown }>) => void
            }
          }
        ).cookies
        cookies.setAll([{ name: 'sb-token', value: 'refreshed', options: { path: '/' } }])
        return {
          auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
        } as unknown as ReturnType<typeof createServerClient>
      })

      const request = createMockRequest('/api/books')
      const response = await updateSession(request)
      const res = response as unknown as {
        _type: string
        cookies: { getAll: () => Array<{ name: string; value: string }> }
      }
      expect(res._type).toBe('json')

      const responseCookies = res.cookies.getAll()
      expect(responseCookies.some((c) => c.name === 'sb-token')).toBe(true)
    })
  })

  describe('セキュリティ', () => {
    it('getUser() が呼ばれる（getSession ではなく）', async () => {
      const { mockGetUser } = setupMockAuth(null)
      const request = createMockRequest('/')
      await updateSession(request)
      expect(mockGetUser).toHaveBeenCalledOnce()
    })

    it('createServerClient に正しい環境変数が渡される', async () => {
      setupMockAuth(null)
      const request = createMockRequest('/')
      await updateSession(request)
      expect(createServerClient).toHaveBeenCalledWith(
        'https://test.supabase.co',
        'test-anon-key',
        expect.objectContaining({
          cookies: expect.objectContaining({
            getAll: expect.any(Function),
            setAll: expect.any(Function),
          }),
        }),
      )
    })
  })
})
