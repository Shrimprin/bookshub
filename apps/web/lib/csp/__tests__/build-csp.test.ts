import { describe, it, expect } from 'vitest'
import { ALLOWED_THUMBNAIL_HOSTS } from '@bookhub/shared'
import { buildContentSecurityPolicy } from '../build-csp'

const NONCE = 'test-nonce-value=='

function getDirective(csp: string, name: string): string | undefined {
  return csp.split('; ').find((directive) => directive.startsWith(`${name} `) || directive === name)
}

describe('buildContentSecurityPolicy', () => {
  it('production の script-src に nonce と strict-dynamic を含める', () => {
    const csp = buildContentSecurityPolicy({ nonce: NONCE, isDev: false })
    const scriptSrc = getDirective(csp, 'script-src')

    expect(scriptSrc).toBeDefined()
    expect(scriptSrc).toContain(`'nonce-${NONCE}'`)
    expect(scriptSrc).toContain("'strict-dynamic'")
    expect(scriptSrc).toContain("'self'")
  })

  it('production の script-src に unsafe-inline / unsafe-eval を含めない', () => {
    const csp = buildContentSecurityPolicy({ nonce: NONCE, isDev: false })
    const scriptSrc = getDirective(csp, 'script-src') ?? ''

    expect(scriptSrc).not.toContain("'unsafe-inline'")
    expect(scriptSrc).not.toContain("'unsafe-eval'")
  })

  it('development の script-src には unsafe-eval を含める (React Refresh runtime 用)', () => {
    const csp = buildContentSecurityPolicy({ nonce: NONCE, isDev: true })
    const scriptSrc = getDirective(csp, 'script-src') ?? ''

    expect(scriptSrc).toContain("'unsafe-eval'")
    expect(scriptSrc).toContain(`'nonce-${NONCE}'`)
    expect(scriptSrc).toContain("'strict-dynamic'")
    expect(scriptSrc).not.toContain("'unsafe-inline'")
  })

  it('img-src に @bookhub/shared の許可ホストが exact + サブドメインで反映される', () => {
    const csp = buildContentSecurityPolicy({ nonce: NONCE, isDev: false })
    const imgSrc = getDirective(csp, 'img-src') ?? ''

    expect(imgSrc).toContain("'self'")
    expect(imgSrc).toContain('data:')
    for (const host of ALLOWED_THUMBNAIL_HOSTS) {
      // thumbnailUrlSchema は exact + サブドメインを許可するため CSP も両方を出す
      expect(imgSrc).toContain(`https://${host}`)
      expect(imgSrc).toContain(`https://*.${host}`)
    }
  })

  it('style-src は当面 unsafe-inline を残す (Phase 4 で再評価)', () => {
    const csp = buildContentSecurityPolicy({ nonce: NONCE, isDev: false })
    const styleSrc = getDirective(csp, 'style-src') ?? ''

    expect(styleSrc).toContain("'self'")
    expect(styleSrc).toContain("'unsafe-inline'")
  })

  it('Supabase との接続を許可する connect-src を含む', () => {
    const csp = buildContentSecurityPolicy({ nonce: NONCE, isDev: false })
    const connectSrc = getDirective(csp, 'connect-src') ?? ''

    expect(connectSrc).toContain("'self'")
    expect(connectSrc).toContain('https://*.supabase.co')
    expect(connectSrc).toContain('wss://*.supabase.co')
  })

  it('クリックジャッキング/オブジェクト埋め込み防御の固定値ディレクティブを含む', () => {
    const csp = buildContentSecurityPolicy({ nonce: NONCE, isDev: false })

    expect(getDirective(csp, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(getDirective(csp, 'object-src')).toBe("object-src 'none'")
    expect(getDirective(csp, 'worker-src')).toBe("worker-src 'none'")
    expect(getDirective(csp, 'base-uri')).toBe("base-uri 'self'")
    expect(getDirective(csp, 'form-action')).toBe("form-action 'self'")
    expect(getDirective(csp, 'default-src')).toBe("default-src 'self'")
    expect(getDirective(csp, 'font-src')).toBe("font-src 'self' data:")
  })

  it('異なる nonce が独立して埋め込まれる', () => {
    const csp1 = buildContentSecurityPolicy({ nonce: 'aaa', isDev: false })
    const csp2 = buildContentSecurityPolicy({ nonce: 'bbb', isDev: false })

    expect(csp1).toContain("'nonce-aaa'")
    expect(csp2).toContain("'nonce-bbb'")
    expect(csp1).not.toContain("'nonce-bbb'")
    expect(csp2).not.toContain("'nonce-aaa'")
  })
})
