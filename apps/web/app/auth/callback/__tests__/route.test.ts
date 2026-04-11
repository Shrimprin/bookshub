import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GET } from '../route'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/server', () => ({
  NextResponse: {
    redirect: vi.fn((url: string) => ({ _redirectUrl: url })),
  },
}))

function createRequest(url: string) {
  return new Request(url)
}

function setupMockExchange(error: { message: string } | null) {
  const mockExchange = vi.fn().mockResolvedValue({ error })
  vi.mocked(createClient).mockResolvedValue({
    auth: { exchangeCodeForSession: mockExchange },
  } as unknown as Awaited<ReturnType<typeof createClient>>)
  return { mockExchange }
}

describe('GET /auth/callback', () => {
  describe('正常系', () => {
    it('code パラメータがあり exchangeCodeForSession 成功 → /bookshelf へリダイレクト', async () => {
      setupMockExchange(null)
      const request = createRequest('https://example.com/auth/callback?code=valid-code')
      await GET(request)
      expect(NextResponse.redirect).toHaveBeenCalledWith('https://example.com/bookshelf')
    })

    it('exchangeCodeForSession に code が正しく渡される', async () => {
      const { mockExchange } = setupMockExchange(null)
      const request = createRequest('https://example.com/auth/callback?code=my-code-123')
      await GET(request)
      expect(mockExchange).toHaveBeenCalledWith('my-code-123')
    })
  })

  describe('エラー系', () => {
    it('exchangeCodeForSession がエラー → /login?error=auth_failed へリダイレクト', async () => {
      setupMockExchange({ message: 'invalid code' })
      const request = createRequest('https://example.com/auth/callback?code=bad-code')
      await GET(request)
      expect(NextResponse.redirect).toHaveBeenCalledWith(
        'https://example.com/login?error=auth_failed',
      )
    })

    it('code パラメータなし → /login?error=auth_failed へリダイレクト', async () => {
      const request = createRequest('https://example.com/auth/callback')
      await GET(request)
      expect(NextResponse.redirect).toHaveBeenCalledWith(
        'https://example.com/login?error=auth_failed',
      )
    })

    it('code が空文字 → /login?error=auth_failed へリダイレクト', async () => {
      const request = createRequest('https://example.com/auth/callback?code=')
      await GET(request)
      expect(NextResponse.redirect).toHaveBeenCalledWith(
        'https://example.com/login?error=auth_failed',
      )
    })

    it('code なしの場合 createClient は呼ばれない', async () => {
      const request = createRequest('https://example.com/auth/callback')
      await GET(request)
      expect(createClient).not.toHaveBeenCalled()
    })
  })

  describe('open redirect 防止', () => {
    it('リダイレクト先は常に同一 origin を使用する', async () => {
      setupMockExchange(null)
      const request = createRequest('https://myapp.com/auth/callback?code=valid')
      await GET(request)
      expect(NextResponse.redirect).toHaveBeenCalledWith('https://myapp.com/bookshelf')
    })
  })
})
