import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const updateSessionMock = vi.fn()

vi.mock('@/lib/supabase/middleware', () => ({
  updateSession: (req: NextRequest, options?: { nonce?: string }) =>
    updateSessionMock(req, options),
}))

import { middleware } from '../middleware'

function createTestRequest(pathname = '/'): NextRequest {
  return {
    headers: new Headers(),
    nextUrl: {
      pathname,
      clone: () => new URL(`http://localhost:3000${pathname}`),
    },
    cookies: { getAll: () => [], set: () => {} },
  } as unknown as NextRequest
}

function makeFakeResponse() {
  return { headers: new Headers() }
}

describe('middleware (CSP nonce オーケストレータ)', () => {
  beforeEach(() => {
    updateSessionMock.mockReset()
  })

  it('updateSession に nonce と csp option を渡す', async () => {
    updateSessionMock.mockResolvedValue(makeFakeResponse())

    await middleware(createTestRequest('/'))

    expect(updateSessionMock).toHaveBeenCalledOnce()
    const [, options] = updateSessionMock.mock.calls[0]
    expect(options).toEqual(
      expect.objectContaining({
        nonce: expect.any(String),
        csp: expect.any(String),
      }),
    )
    const typed = options as { nonce: string; csp: string }
    expect(typed.nonce.length).toBeGreaterThan(0)
    // csp は同じ nonce を含む完全な CSP 文字列であること (Next.js の getScriptNonceFromHeader が
    // request.headers から抽出するために必要)
    expect(typed.csp).toContain(`'nonce-${typed.nonce}'`)
    expect(typed.csp).toContain('script-src')
  })

  it('レスポンスに Content-Security-Policy header を set する', async () => {
    const fakeResponse = makeFakeResponse()
    updateSessionMock.mockResolvedValue(fakeResponse)

    const response = (await middleware(createTestRequest('/'))) as unknown as {
      headers: Headers
    }

    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toBeTruthy()
    expect(csp).toContain('script-src')
    expect(csp).toContain("'strict-dynamic'")
    expect(csp).toContain("'self'")
  })

  it('CSP に埋め込まれる nonce と updateSession に渡す nonce が一致する', async () => {
    updateSessionMock.mockResolvedValue(makeFakeResponse())

    const response = (await middleware(createTestRequest('/'))) as unknown as {
      headers: Headers
    }

    const passedNonce = (updateSessionMock.mock.calls[0][1] as { nonce: string }).nonce
    const csp = response.headers.get('Content-Security-Policy') ?? ''
    expect(csp).toContain(`'nonce-${passedNonce}'`)
  })

  it('CSP は production 経路で unsafe-inline / unsafe-eval を含まない', async () => {
    updateSessionMock.mockResolvedValue(makeFakeResponse())

    const response = (await middleware(createTestRequest('/'))) as unknown as {
      headers: Headers
    }

    const csp = response.headers.get('Content-Security-Policy') ?? ''
    const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src ')) ?? ''
    expect(scriptSrc).not.toContain("'unsafe-inline'")
    // テスト環境 NODE_ENV=test 想定。dev でない経路でのスナップショット。
    expect(scriptSrc).not.toContain("'unsafe-eval'")
  })

  it('リクエスト毎に異なる nonce を生成する', async () => {
    updateSessionMock.mockResolvedValue(makeFakeResponse())

    await middleware(createTestRequest('/'))
    await middleware(createTestRequest('/'))

    const nonce1 = (updateSessionMock.mock.calls[0][1] as { nonce: string }).nonce
    const nonce2 = (updateSessionMock.mock.calls[1][1] as { nonce: string }).nonce
    expect(nonce1).not.toBe(nonce2)
  })

  it('updateSession が redirect を返した経路でも CSP を上書きで set する', async () => {
    // updateSession が既に何らかの header をセットしている状況を想定
    const fakeResponse = { headers: new Headers({ Location: '/login' }) }
    updateSessionMock.mockResolvedValue(fakeResponse)

    const response = (await middleware(createTestRequest('/bookshelf'))) as unknown as {
      headers: Headers
    }

    expect(response.headers.get('Content-Security-Policy')).toBeTruthy()
    expect(response.headers.get('Location')).toBe('/login')
  })
})
