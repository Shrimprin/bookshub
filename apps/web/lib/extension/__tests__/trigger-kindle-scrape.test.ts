import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('triggerKindleScrape', () => {
  const originalChrome = (globalThis as { chrome?: unknown }).chrome
  const originalEnv = process.env.NEXT_PUBLIC_EXTENSION_ID

  beforeEach(() => {
    vi.resetModules()
    delete (globalThis as { chrome?: unknown }).chrome
    delete process.env.NEXT_PUBLIC_EXTENSION_ID
  })

  afterEach(() => {
    if (originalChrome !== undefined) {
      ;(globalThis as { chrome?: unknown }).chrome = originalChrome
    }
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_EXTENSION_ID = originalEnv
    } else {
      delete process.env.NEXT_PUBLIC_EXTENSION_ID
    }
  })

  it("chrome が未定義の場合は 'no-extension' を返す (Firefox/Safari/SSR)", async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'ext-id'
    const { triggerKindleScrape } = await import('../trigger-kindle-scrape')
    const result = await triggerKindleScrape()
    expect(result).toEqual({ status: 'no-extension' })
  })

  it("NEXT_PUBLIC_EXTENSION_ID 未設定なら 'misconfigured' を返す", async () => {
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: { sendMessage: vi.fn(), id: 'browser-ext-id' },
    }
    const { triggerKindleScrape } = await import('../trigger-kindle-scrape')
    const result = await triggerKindleScrape()
    expect(result).toEqual({ status: 'misconfigured' })
  })

  it("成功レスポンス (success:true) なら 'sent' を返し store='kindle' を送る", async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'my-ext-id'
    const sendMessage = vi.fn((_id, _msg, callback) => callback?.({ success: true }))
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: { sendMessage, id: 'browser-ext-id', lastError: null },
    }
    const { triggerKindleScrape } = await import('../trigger-kindle-scrape')
    const result = await triggerKindleScrape()
    expect(result).toEqual({ status: 'sent' })
    expect(sendMessage).toHaveBeenCalledWith(
      'my-ext-id',
      { type: 'TRIGGER_SCRAPE', store: 'kindle' },
      expect.any(Function),
    )
  })

  it("lastError があれば 'no-extension' を返す (拡張機能未インストール)", async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'my-ext-id'
    const chromeMock = {
      runtime: {
        sendMessage: vi.fn((_id, _msg, callback) => {
          chromeMock.runtime.lastError = { message: 'Could not establish connection.' }
          callback?.(undefined)
        }),
        id: 'browser-ext-id',
        lastError: null as { message: string } | null,
      },
    }
    ;(globalThis as { chrome?: unknown }).chrome = chromeMock
    const { triggerKindleScrape } = await import('../trigger-kindle-scrape')
    const result = await triggerKindleScrape()
    expect(result).toEqual({ status: 'no-extension' })
  })

  it("reason='already_in_progress' なら 'in-progress' を返す", async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'my-ext-id'
    const sendMessage = vi.fn((_id, _msg, callback) =>
      callback?.({ success: false, error: '取り込みが既に進行中です (already in progress)' }),
    )
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: { sendMessage, id: 'browser-ext-id', lastError: null },
    }
    const { triggerKindleScrape } = await import('../trigger-kindle-scrape')
    const result = await triggerKindleScrape()
    expect(result).toEqual({ status: 'in-progress' })
  })

  it("その他の error response は 'error' を返す", async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'my-ext-id'
    const sendMessage = vi.fn((_id, _msg, callback) =>
      callback?.({ success: false, error: 'タブの作成に失敗しました' }),
    )
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: { sendMessage, id: 'browser-ext-id', lastError: null },
    }
    const { triggerKindleScrape } = await import('../trigger-kindle-scrape')
    const result = await triggerKindleScrape()
    expect(result).toMatchObject({ status: 'error' })
  })

  it("sendMessage が例外を投げても 'error' で握りつぶす", async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'my-ext-id'
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        sendMessage: vi.fn(() => {
          throw new Error('extension not installed')
        }),
        id: 'browser-ext-id',
        lastError: null,
      },
    }
    const { triggerKindleScrape } = await import('../trigger-kindle-scrape')
    const result = await triggerKindleScrape()
    expect(result.status).toBe('error')
  })
})
