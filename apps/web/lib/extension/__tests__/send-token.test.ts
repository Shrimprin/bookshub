import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('sendTokenToExtension', () => {
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

  it('chrome が未定義の場合は何もしない（Firefox/Safari/SSR）', async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'ext-id'
    const { sendTokenToExtension } = await import('../send-token')
    await expect(sendTokenToExtension('token')).resolves.toBeUndefined()
  })

  it('NEXT_PUBLIC_EXTENSION_ID が未設定の場合は何もしない', async () => {
    const sendMessage = vi.fn()
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: { sendMessage, id: 'browser-ext-id' },
    }
    const { sendTokenToExtension } = await import('../send-token')
    await sendTokenToExtension('token')
    expect(sendMessage).not.toHaveBeenCalled()
  })

  it('token が文字列の場合 SET_ACCESS_TOKEN を送信する', async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'my-extension-id'
    const sendMessage = vi.fn((_id, _msg, callback) => callback?.({ success: true }))
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: { sendMessage, id: 'browser-ext-id', lastError: null },
    }
    const { sendTokenToExtension } = await import('../send-token')
    await sendTokenToExtension('access-token-value')
    expect(sendMessage).toHaveBeenCalledWith(
      'my-extension-id',
      { type: 'SET_ACCESS_TOKEN', token: 'access-token-value' },
      expect.any(Function),
    )
  })

  it('token が null の場合 CLEAR_ACCESS_TOKEN を送信する', async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'my-extension-id'
    const sendMessage = vi.fn((_id, _msg, callback) => callback?.({ success: true }))
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: { sendMessage, id: 'browser-ext-id', lastError: null },
    }
    const { sendTokenToExtension } = await import('../send-token')
    await sendTokenToExtension(null)
    expect(sendMessage).toHaveBeenCalledWith(
      'my-extension-id',
      { type: 'CLEAR_ACCESS_TOKEN' },
      expect.any(Function),
    )
  })

  it('拡張機能未インストール時の lastError をエラーとして投げない', async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'my-extension-id'
    const chromeMock: {
      runtime: {
        sendMessage: ReturnType<typeof vi.fn>
        id: string
        lastError: { message: string } | null
      }
    } = {
      runtime: {
        sendMessage: vi.fn((_id, _msg, callback) => {
          chromeMock.runtime.lastError = { message: 'Could not establish connection.' }
          callback?.(undefined)
        }),
        id: 'browser-ext-id',
        lastError: null,
      },
    }
    ;(globalThis as { chrome?: unknown }).chrome = chromeMock

    const { sendTokenToExtension } = await import('../send-token')
    await expect(sendTokenToExtension('token')).resolves.toBeUndefined()
  })

  it('sendMessage が例外を投げてもユーザー側には伝播させない', async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'my-extension-id'
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: {
        sendMessage: vi.fn(() => {
          throw new Error('extension not installed')
        }),
        id: 'browser-ext-id',
        lastError: null,
      },
    }
    const { sendTokenToExtension } = await import('../send-token')
    await expect(sendTokenToExtension('token')).resolves.toBeUndefined()
  })

  it('空文字列の token は shared スキーマで弾かれ sendMessage を呼ばない', async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'my-extension-id'
    const sendMessage = vi.fn()
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: { sendMessage, id: 'browser-ext-id', lastError: null },
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { sendTokenToExtension } = await import('../send-token')
    await sendTokenToExtension('')

    expect(sendMessage).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      '[sendTokenToExtension] invalid message, skipping send',
      expect.objectContaining({ path: ['token'] }),
    )

    warnSpy.mockRestore()
  })

  it('8192 文字を超える token は shared スキーマで弾かれ sendMessage を呼ばない', async () => {
    process.env.NEXT_PUBLIC_EXTENSION_ID = 'my-extension-id'
    const sendMessage = vi.fn()
    ;(globalThis as { chrome?: unknown }).chrome = {
      runtime: { sendMessage, id: 'browser-ext-id', lastError: null },
    }
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const { sendTokenToExtension } = await import('../send-token')
    await sendTokenToExtension('a'.repeat(8193))

    expect(sendMessage).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      '[sendTokenToExtension] invalid message, skipping send',
      expect.objectContaining({ path: ['token'] }),
    )

    warnSpy.mockRestore()
  })
})
