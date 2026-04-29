import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ScrapeBook } from '@bookhub/shared'
import type { SendScrapedBooksMessage, ReloadBookshelfMessage } from '../../types/messages.js'

// --- chrome API モック ---

const mockStorageData = new Map<string, unknown>()
const mockSessionData = new Map<string, unknown>()

const mockTabs = [
  { id: 1, url: 'http://localhost:3000/bookshelf' },
  { id: 2, url: 'https://www.amazon.co.jp/kindle' },
]

const EXTENSION_ID = 'test-extension-id'

// session 領域用に setAccessLevel もモック化する (background が import 時に呼ぶ)
// clearAllMocks で履歴が消えるため、import 時の引数を別変数で退避する。
// vi.fn のかわりに pure function spy を使い mockImplementation 経由のリセット影響を排除する。
const capturedSetAccessLevelCalls: Array<{ accessLevel: string }> = []
const sessionSetAccessLevel = (opts: { accessLevel: string }) => {
  capturedSetAccessLevelCalls.push(opts)
  return Promise.resolve()
}

function makeStorageAreaMock(store: Map<string, unknown>, extras: Record<string, unknown> = {}) {
  return {
    get: vi.fn((keys: string[]) => {
      const result: Record<string, unknown> = {}
      for (const key of keys) {
        const value = store.get(key)
        if (value !== undefined) result[key] = value
      }
      return Promise.resolve(result)
    }),
    set: vi.fn((items: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(items)) {
        store.set(key, value)
      }
      return Promise.resolve()
    }),
    remove: vi.fn((keys: string[]) => {
      for (const key of keys) {
        store.delete(key)
      }
      return Promise.resolve()
    }),
    ...extras,
  }
}

vi.stubGlobal('chrome', {
  runtime: {
    id: EXTENSION_ID,
    onInstalled: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
    onMessageExternal: { addListener: vi.fn() },
    lastError: null,
  },
  storage: {
    local: makeStorageAreaMock(mockStorageData),
    session: makeStorageAreaMock(mockSessionData, { setAccessLevel: sessionSetAccessLevel }),
  },
  tabs: {
    query: vi.fn((queryInfo: { url: string }) => {
      // __API_BASE_URL__ は http://localhost:3000 なので bookshelf パターンにマッチ
      if (queryInfo.url.includes('localhost:3000/bookshelf')) {
        return Promise.resolve([mockTabs[0]])
      }
      return Promise.resolve([])
    }),
    reload: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    get: vi.fn(),
    remove: vi.fn().mockResolvedValue(undefined),
    // onRemoved の addListener はトップレベル登録の事実だけ確認できれば十分。
    // 個別のロジック検証は export された handleTabRemoved を直接呼んで行う
    // (vitest のモジュールキャッシュにより re-import 時のリスナー再登録が走らないため、
    // capturedOnRemoved 経由のテストは脆く redundant)。
    onRemoved: { addListener: vi.fn() },
  },
})

// --- fetch モック ---

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// --- __API_BASE_URL__ モック ---

vi.stubGlobal('__API_BASE_URL__', 'http://localhost:3000')
vi.stubGlobal('__ALLOWED_EXTERNAL_ORIGINS__', ['http://localhost:3000'])

describe('background', () => {
  let handleMessage: (message: unknown, sender: chrome.runtime.MessageSender) => Promise<unknown>
  let handleExternalMessage: (
    message: unknown,
    sender: chrome.runtime.MessageSender,
  ) => Promise<unknown>
  let handleTabRemoved: (tabId: number) => Promise<void>

  const testBooks: ScrapeBook[] = [
    {
      title: 'テスト漫画 1巻',
      author: 'テスト作者',
      volumeNumber: 1,
      store: 'kindle',
      isAdult: false,
    },
  ]

  const mockSender: chrome.runtime.MessageSender = { id: EXTENSION_ID }

  beforeEach(async () => {
    vi.clearAllMocks()
    mockStorageData.clear()
    mockSessionData.clear()
    mockStorageData.set('bookhub_access_token', 'test-token')

    // background/index.ts を import するとリスナーが登録される
    // onMessage.addListener に渡された関数を取り出す
    const bg = await import('../index.js')
    handleMessage = bg.handleMessage
    handleExternalMessage = bg.handleExternalMessage
    handleTabRemoved = bg.handleTabRemoved
  })

  describe('handleMessage', () => {
    describe('SEND_SCRAPED_BOOKS', () => {
      it('認証トークンがない場合 AUTH_ERROR を返す', async () => {
        mockStorageData.delete('bookhub_access_token')

        const message: SendScrapedBooksMessage = {
          type: 'SEND_SCRAPED_BOOKS',
          books: testBooks,
        }

        const result = await handleMessage(message, mockSender)
        expect(result).toEqual({
          success: false,
          error: '未認証: ログインが必要です',
          code: 'AUTH_ERROR',
        })
      })

      it('バリデーションエラーの場合 VALIDATION_ERROR を返す', async () => {
        const invalidMessage: SendScrapedBooksMessage = {
          type: 'SEND_SCRAPED_BOOKS',
          books: [{ title: '', author: '', store: 'kindle', isAdult: false } as ScrapeBook],
        }

        const result = await handleMessage(invalidMessage, mockSender)
        expect(result).toEqual(
          expect.objectContaining({
            success: false,
            code: 'VALIDATION_ERROR',
          }),
        )
      })

      it('API が 200 を返す場合、成功レスポンスを返す', async () => {
        const apiResponse = {
          savedCount: 1,
          duplicateCount: 0,
          duplicates: [],
        }
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(apiResponse),
        })

        const message: SendScrapedBooksMessage = {
          type: 'SEND_SCRAPED_BOOKS',
          books: testBooks,
        }

        const result = await handleMessage(message, mockSender)

        expect(result).toEqual({ success: true, data: apiResponse })
        expect(mockFetch).toHaveBeenCalledWith(
          'http://localhost:3000/api/scrape',
          expect.objectContaining({
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer test-token',
            },
          }),
        )
      })

      it('API が 401 を返す場合 AUTH_ERROR を返し、storage からトークンを削除する', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Unauthorized' }),
        })

        const message: SendScrapedBooksMessage = {
          type: 'SEND_SCRAPED_BOOKS',
          books: testBooks,
        }

        const result = await handleMessage(message, mockSender)
        expect(result).toEqual({
          success: false,
          error: '認証エラー: 再ログインが必要です',
          code: 'AUTH_ERROR',
        })
        // 期限切れトークンが storage から削除されることを確認
        expect(mockStorageData.has('bookhub_access_token')).toBe(false)
      })

      it('API が 400 を返す場合 VALIDATION_ERROR を返す', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: 'Bad Request' }),
        })

        const message: SendScrapedBooksMessage = {
          type: 'SEND_SCRAPED_BOOKS',
          books: testBooks,
        }

        const result = await handleMessage(message, mockSender)
        expect(result).toEqual(
          expect.objectContaining({
            success: false,
            code: 'VALIDATION_ERROR',
          }),
        )
      })

      it('API が 500 を返す場合 API_ERROR を返す', async () => {
        mockFetch.mockResolvedValue({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: 'Internal Server Error' }),
        })

        const message: SendScrapedBooksMessage = {
          type: 'SEND_SCRAPED_BOOKS',
          books: testBooks,
        }

        const result = await handleMessage(message, mockSender)
        expect(result).toEqual(
          expect.objectContaining({
            success: false,
            code: 'API_ERROR',
          }),
        )
      })

      it('ネットワークエラーの場合 NETWORK_ERROR を返す', async () => {
        mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

        const message: SendScrapedBooksMessage = {
          type: 'SEND_SCRAPED_BOOKS',
          books: testBooks,
        }

        const result = await handleMessage(message, mockSender)
        expect(result).toEqual(
          expect.objectContaining({
            success: false,
            code: 'NETWORK_ERROR',
          }),
        )
      })

      it('成功時に同期結果を storage に保存する', async () => {
        const apiResponse = {
          savedCount: 3,
          duplicateCount: 1,
          duplicates: [{ title: '既存漫画', existingStores: ['dmm'] }],
        }
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(apiResponse),
        })

        const message: SendScrapedBooksMessage = {
          type: 'SEND_SCRAPED_BOOKS',
          books: testBooks,
        }

        await handleMessage(message, mockSender)

        const syncResult = mockStorageData.get('bookhub_last_sync_result') as Record<
          string,
          unknown
        >
        expect(syncResult).toMatchObject({
          status: 'partial',
          savedCount: 3,
          duplicateCount: 1,
        })
      })

      it('成功時に本棚タブをリロードする', async () => {
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              savedCount: 1,
              duplicateCount: 0,
              duplicates: [],
            }),
        })

        const message: SendScrapedBooksMessage = {
          type: 'SEND_SCRAPED_BOOKS',
          books: testBooks,
        }

        await handleMessage(message, mockSender)

        expect(chrome.tabs.query).toHaveBeenCalled()
        expect(chrome.tabs.reload).toHaveBeenCalledWith(1)
      })
    })

    describe('RELOAD_BOOKSHELF', () => {
      it('本棚タブをリロードする', async () => {
        const message: ReloadBookshelfMessage = { type: 'RELOAD_BOOKSHELF' }

        await handleMessage(message, mockSender)

        expect(chrome.tabs.query).toHaveBeenCalled()
        expect(chrome.tabs.reload).toHaveBeenCalledWith(1)
      })
    })

    describe('ABORT_SCRAPE (Phase C)', () => {
      it('trigger 経由で開いたタブが残っているとき tab を閉じ flag を clear する', async () => {
        mockSessionData.set('bookhub_kindle_trigger', {
          tabId: 77,
          startedAt: Date.now() - 5000,
          source: 'web',
          store: 'kindle',
        })

        await handleMessage({ type: 'ABORT_SCRAPE', reason: 'NO_DOM' }, mockSender)

        expect(chrome.tabs.remove).toHaveBeenCalledWith(77)
        expect(mockSessionData.has('bookhub_kindle_trigger')).toBe(false)
        const result = mockStorageData.get('bookhub_last_sync_result') as Record<string, unknown>
        expect(result).toMatchObject({
          status: 'error',
          errorCode: 'UNKNOWN_ERROR',
          trigger: 'web',
          store: 'kindle',
        })
        expect(result.error).toMatch(/読み込み/)
      })

      it('reason ごとに lastSyncResult.error メッセージが分かれる', async () => {
        mockSessionData.set('bookhub_kindle_trigger', {
          tabId: 1,
          startedAt: Date.now(),
          source: 'web',
          store: 'kindle',
        })
        await handleMessage({ type: 'ABORT_SCRAPE', reason: 'NO_BOOKS' }, mockSender)
        const result = mockStorageData.get('bookhub_last_sync_result') as Record<string, unknown>
        expect(result.error).toMatch(/書籍が見つかりません/)
      })

      it('trigger flag が無くても lastSyncResult のみ書く (手動経路の安全策)', async () => {
        // mockSessionData.set 無し
        await handleMessage({ type: 'ABORT_SCRAPE', reason: 'UNEXPECTED_ERROR' }, mockSender)
        expect(chrome.tabs.remove).not.toHaveBeenCalled()
        const result = mockStorageData.get('bookhub_last_sync_result') as Record<string, unknown>
        expect(result).toMatchObject({ status: 'error', errorCode: 'UNKNOWN_ERROR' })
      })

      it('未知の reason 値は UNEXPECTED_ERROR にフォールバック (runtime 検証)', async () => {
        await handleMessage({ type: 'ABORT_SCRAPE', reason: 'totally_made_up_reason' }, mockSender)
        const result = mockStorageData.get('bookhub_last_sync_result') as Record<string, unknown>
        // ABORT_REASON_MESSAGES.UNEXPECTED_ERROR の文言にフォールバックする
        expect(result.error).toMatch(/予期しないエラー/)
        // 未定義キー lookup で undefined が書かれないことを保証
        expect(result.error).not.toBeUndefined()
      })
    })

    describe('全て重複の場合', () => {
      it('savedCount=0, duplicateCount>0 のとき status が partial になる', async () => {
        const apiResponse = {
          savedCount: 0,
          duplicateCount: 3,
          duplicates: [
            { title: '漫画A', existingStores: ['kindle'] },
            { title: '漫画B', existingStores: ['dmm'] },
            { title: '漫画C', existingStores: ['kindle', 'dmm'] },
          ],
        }
        mockFetch.mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve(apiResponse),
        })

        const message: SendScrapedBooksMessage = {
          type: 'SEND_SCRAPED_BOOKS',
          books: testBooks,
        }

        await handleMessage(message, mockSender)

        const syncResult = mockStorageData.get('bookhub_last_sync_result') as Record<
          string,
          unknown
        >
        expect(syncResult).toMatchObject({
          status: 'partial',
          savedCount: 0,
          duplicateCount: 3,
        })
      })
    })

    describe('sender validation', () => {
      it('sender.id が自拡張機能と異なる場合 UNKNOWN_ERROR を返す', async () => {
        const foreignSender: chrome.runtime.MessageSender = { id: 'foreign-extension-id' }
        const message: SendScrapedBooksMessage = {
          type: 'SEND_SCRAPED_BOOKS',
          books: testBooks,
        }

        const result = await handleMessage(message, foreignSender)
        expect(result).toEqual({
          success: false,
          error: '不正な送信元です',
          code: 'UNKNOWN_ERROR',
        })
        // fetch が呼ばれていないことを確認
        expect(mockFetch).not.toHaveBeenCalled()
      })

      it('sender.id が undefined の場合 UNKNOWN_ERROR を返す', async () => {
        const noIdSender: chrome.runtime.MessageSender = {}

        const result = await handleMessage(
          { type: 'SEND_SCRAPED_BOOKS', books: testBooks },
          noIdSender,
        )
        expect(result).toEqual({
          success: false,
          error: '不正な送信元です',
          code: 'UNKNOWN_ERROR',
        })
      })
    })

    describe('unknown message', () => {
      it('不明なメッセージ type の場合 UNKNOWN_ERROR を返す', async () => {
        const result = await handleMessage({ type: 'INVALID_TYPE' }, mockSender)
        expect(result).toEqual(
          expect.objectContaining({
            success: false,
            code: 'UNKNOWN_ERROR',
          }),
        )
      })

      it('null の場合 UNKNOWN_ERROR を返す', async () => {
        const result = await handleMessage(null, mockSender)
        expect(result).toEqual(
          expect.objectContaining({
            success: false,
            code: 'UNKNOWN_ERROR',
          }),
        )
      })

      it('type が文字列でない場合 UNKNOWN_ERROR を返す', async () => {
        const result = await handleMessage({ type: 123 }, mockSender)
        expect(result).toEqual(
          expect.objectContaining({
            success: false,
            code: 'UNKNOWN_ERROR',
          }),
        )
      })
    })
  })

  describe('handleExternalMessage', () => {
    const allowedSender: chrome.runtime.MessageSender = {
      origin: 'http://localhost:3000',
      url: 'http://localhost:3000/bookshelf',
      id: 'some-external-id',
    }

    describe('origin 検証', () => {
      beforeEach(() => {
        mockStorageData.delete('bookhub_access_token')
      })

      it('許可されていない origin からのメッセージを拒否する', async () => {
        const result = await handleExternalMessage(
          { type: 'SET_ACCESS_TOKEN', token: 'my-token' },
          { origin: 'https://evil.example.com', id: 'evil-id' },
        )
        expect(result).toMatchObject({ success: false, error: expect.any(String) })
        expect(mockStorageData.get('bookhub_access_token')).toBeUndefined()
      })

      it('origin が undefined の場合は拒否する', async () => {
        const result = await handleExternalMessage(
          { type: 'SET_ACCESS_TOKEN', token: 'my-token' },
          { id: 'some-id' },
        )
        expect(result).toMatchObject({ success: false, error: expect.any(String) })
        expect(mockStorageData.get('bookhub_access_token')).toBeUndefined()
      })
    })

    describe('メッセージバリデーション', () => {
      beforeEach(() => {
        mockStorageData.delete('bookhub_access_token')
      })

      it('不明な type のメッセージを拒否する', async () => {
        const result = await handleExternalMessage({ type: 'UNKNOWN' }, allowedSender)
        expect(result).toMatchObject({ success: false, error: expect.any(String) })
      })

      it('空文字列の token を拒否する', async () => {
        const result = await handleExternalMessage(
          { type: 'SET_ACCESS_TOKEN', token: '' },
          allowedSender,
        )
        expect(result).toMatchObject({ success: false, error: expect.any(String) })
        expect(mockStorageData.get('bookhub_access_token')).toBeUndefined()
      })

      it('token が文字列でない場合は拒否する', async () => {
        const result = await handleExternalMessage(
          { type: 'SET_ACCESS_TOKEN', token: 12345 },
          allowedSender,
        )
        expect(result).toMatchObject({ success: false, error: expect.any(String) })
      })

      it('8192 文字を超える token を拒否する', async () => {
        const result = await handleExternalMessage(
          { type: 'SET_ACCESS_TOKEN', token: 'a'.repeat(8193) },
          allowedSender,
        )
        expect(result).toMatchObject({ success: false, error: expect.any(String) })
      })

      it('null を拒否する', async () => {
        const result = await handleExternalMessage(null, allowedSender)
        expect(result).toMatchObject({ success: false, error: expect.any(String) })
      })
    })

    describe('SET_ACCESS_TOKEN', () => {
      beforeEach(() => {
        mockStorageData.delete('bookhub_access_token')
      })

      it('許可 origin から SET_ACCESS_TOKEN で storage にトークンを保存する', async () => {
        const result = await handleExternalMessage(
          { type: 'SET_ACCESS_TOKEN', token: 'new-access-token' },
          allowedSender,
        )
        expect(result).toEqual({ success: true })
        expect(mockStorageData.get('bookhub_access_token')).toBe('new-access-token')
      })

      it('既存のトークンを上書きする', async () => {
        mockStorageData.set('bookhub_access_token', 'old-token')
        await handleExternalMessage({ type: 'SET_ACCESS_TOKEN', token: 'new-token' }, allowedSender)
        expect(mockStorageData.get('bookhub_access_token')).toBe('new-token')
      })
    })

    describe('CLEAR_ACCESS_TOKEN', () => {
      it('許可 origin から CLEAR_ACCESS_TOKEN で storage からトークンを削除する', async () => {
        mockStorageData.set('bookhub_access_token', 'some-token')
        const result = await handleExternalMessage({ type: 'CLEAR_ACCESS_TOKEN' }, allowedSender)
        expect(result).toEqual({ success: true })
        expect(mockStorageData.get('bookhub_access_token')).toBeUndefined()
      })

      it('トークンがない状態でも成功を返す', async () => {
        mockStorageData.delete('bookhub_access_token')
        const result = await handleExternalMessage({ type: 'CLEAR_ACCESS_TOKEN' }, allowedSender)
        expect(result).toEqual({ success: true })
      })
    })

    describe('TRIGGER_SCRAPE', () => {
      const tabsCreate = (): ReturnType<typeof vi.fn> =>
        chrome.tabs.create as ReturnType<typeof vi.fn>
      const tabsGet = (): ReturnType<typeof vi.fn> => chrome.tabs.get as ReturnType<typeof vi.fn>

      it('許可 origin から TRIGGER_SCRAPE で新規タブを active:false で開く', async () => {
        tabsCreate().mockResolvedValue({ id: 99 })

        const result = await handleExternalMessage(
          { type: 'TRIGGER_SCRAPE', store: 'kindle' },
          allowedSender,
        )

        expect(result).toEqual({ success: true })
        expect(chrome.tabs.create).toHaveBeenCalledWith(
          expect.objectContaining({
            active: false,
            url: expect.stringContaining('pageNumber=1'),
          }),
        )
        // session storage に flag が書かれる
        const stored = mockSessionData.get('bookhub_kindle_trigger') as
          | { tabId: number; source: string; store: string }
          | undefined
        expect(stored?.tabId).toBe(99)
        expect(stored?.source).toBe('web')
        expect(stored?.store).toBe('kindle')
      })

      it('未許可 origin からの TRIGGER_SCRAPE は拒否する', async () => {
        tabsCreate().mockResolvedValue({ id: 99 })

        const result = await handleExternalMessage(
          { type: 'TRIGGER_SCRAPE', store: 'kindle' },
          { origin: 'https://evil.example.com', id: 'evil-id' },
        )

        expect(result).toMatchObject({ success: false })
        expect(chrome.tabs.create).not.toHaveBeenCalled()
        expect(mockSessionData.has('bookhub_kindle_trigger')).toBe(false)
      })

      it('flag 既存 + tab 生存中なら ALREADY_IN_PROGRESS を返し create しない', async () => {
        mockSessionData.set('bookhub_kindle_trigger', {
          tabId: 42,
          startedAt: Date.now(),
          source: 'web',
          store: 'kindle',
        })
        tabsGet().mockResolvedValue({ id: 42 }) // 生存
        tabsCreate().mockResolvedValue({ id: 99 })

        const result = await handleExternalMessage(
          { type: 'TRIGGER_SCRAPE', store: 'kindle' },
          allowedSender,
        )

        expect(result).toMatchObject({
          success: false,
          code: 'ALREADY_IN_PROGRESS',
        })
        expect(chrome.tabs.create).not.toHaveBeenCalled()
        // flag は変更されない
        const stored = mockSessionData.get('bookhub_kindle_trigger') as { tabId: number }
        expect(stored.tabId).toBe(42)
      })

      it('flag 既存 + tab 不在なら古い flag を clear して新規 tab 作成', async () => {
        mockSessionData.set('bookhub_kindle_trigger', {
          tabId: 42,
          startedAt: Date.now(),
          source: 'web',
          store: 'kindle',
        })
        tabsGet().mockRejectedValue(new Error('No tab with id: 42'))
        tabsCreate().mockResolvedValue({ id: 99 })

        const result = await handleExternalMessage(
          { type: 'TRIGGER_SCRAPE', store: 'kindle' },
          allowedSender,
        )

        expect(result).toEqual({ success: true })
        expect(chrome.tabs.create).toHaveBeenCalled()
        const stored = mockSessionData.get('bookhub_kindle_trigger') as { tabId: number }
        expect(stored.tabId).toBe(99)
      })

      it('flag 既存 + TTL (10分) 超過なら新規 tab を作る', async () => {
        const elevenMinutesAgo = Date.now() - 11 * 60 * 1000
        mockSessionData.set('bookhub_kindle_trigger', {
          tabId: 42,
          startedAt: elevenMinutesAgo,
          source: 'web',
          store: 'kindle',
        })
        // tabs.get は呼ばれず、TTL 判定だけで stale と扱う想定 (実装は tabs.get を skip しない場合もあり)
        tabsGet().mockResolvedValue({ id: 42 })
        tabsCreate().mockResolvedValue({ id: 99 })

        const result = await handleExternalMessage(
          { type: 'TRIGGER_SCRAPE', store: 'kindle' },
          allowedSender,
        )

        expect(result).toEqual({ success: true })
        expect(chrome.tabs.create).toHaveBeenCalled()
        const stored = mockSessionData.get('bookhub_kindle_trigger') as { tabId: number }
        expect(stored.tabId).toBe(99)
      })

      it('未対応 store は misconfigured エラー (Zod parse 失敗で拒否)', async () => {
        // Zod schema レベルで弾かれる
        const result = await handleExternalMessage(
          { type: 'TRIGGER_SCRAPE', store: 'rakuten' },
          allowedSender,
        )

        expect(result).toMatchObject({ success: false })
        expect(chrome.tabs.create).not.toHaveBeenCalled()
      })

      it('chrome.tabs.create が tab.id を返さなければエラーを返し flag をセットしない', async () => {
        tabsCreate().mockResolvedValue({ id: undefined })

        const result = await handleExternalMessage(
          { type: 'TRIGGER_SCRAPE', store: 'kindle' },
          allowedSender,
        )

        expect(result).toMatchObject({ success: false })
        expect(mockSessionData.has('bookhub_kindle_trigger')).toBe(false)
      })
    })
  })

  describe('handleSendScrapedBooks cleanup (Phase 5)', () => {
    function seedTrigger(opts: { tabId?: number; startedAt?: number } = {}) {
      mockSessionData.set('bookhub_kindle_trigger', {
        tabId: opts.tabId ?? 55,
        startedAt: opts.startedAt ?? Date.now() - 1000,
        source: 'web',
        store: 'kindle',
      })
    }

    it('成功時に tabs.remove を呼び flag を clear し observability フィールドを記録する', async () => {
      seedTrigger({ tabId: 55, startedAt: Date.now() - 2000 })
      mockStorageData.set('bookhub_scrape_session_v1', {
        startedAt: Date.now(),
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: 3,
        books: [],
        seenKeys: [],
      })
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            savedCount: 5,
            duplicateCount: 1,
            duplicates: [{ title: 'dup', existingStores: ['kindle'] }],
          }),
      })

      await handleMessage(
        { type: 'SEND_SCRAPED_BOOKS', books: testBooks } satisfies SendScrapedBooksMessage,
        mockSender,
      )

      expect(chrome.tabs.remove).toHaveBeenCalledWith(55)
      expect(mockSessionData.has('bookhub_kindle_trigger')).toBe(false)
      const result = mockStorageData.get('bookhub_last_sync_result') as Record<string, unknown>
      expect(result).toMatchObject({
        status: 'partial',
        savedCount: 5,
        duplicateCount: 1,
        trigger: 'web',
        store: 'kindle',
        pagesScraped: 3,
      })
      expect(result.durationMs).toBeGreaterThan(0)
    })

    it('401 (AUTH_ERROR) でも tab を閉じ flag を clear し errorCode=AUTH_ERROR を記録する', async () => {
      seedTrigger({ tabId: 88 })
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      })

      await handleMessage(
        { type: 'SEND_SCRAPED_BOOKS', books: testBooks } satisfies SendScrapedBooksMessage,
        mockSender,
      )

      expect(chrome.tabs.remove).toHaveBeenCalledWith(88)
      expect(mockSessionData.has('bookhub_kindle_trigger')).toBe(false)
      const result = mockStorageData.get('bookhub_last_sync_result') as Record<string, unknown>
      expect(result).toMatchObject({
        status: 'error',
        errorCode: 'AUTH_ERROR',
        trigger: 'web',
        store: 'kindle',
      })
    })

    it('500 (API_ERROR) でも tab を閉じ flag を clear し errorCode=API_ERROR を記録する', async () => {
      seedTrigger({ tabId: 88 })
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      })

      await handleMessage(
        { type: 'SEND_SCRAPED_BOOKS', books: testBooks } satisfies SendScrapedBooksMessage,
        mockSender,
      )

      expect(chrome.tabs.remove).toHaveBeenCalledWith(88)
      expect(mockSessionData.has('bookhub_kindle_trigger')).toBe(false)
      const result = mockStorageData.get('bookhub_last_sync_result') as Record<string, unknown>
      expect(result).toMatchObject({
        status: 'error',
        errorCode: 'API_ERROR',
      })
    })

    it('NETWORK_ERROR でも tab を閉じ flag を clear し errorCode=NETWORK_ERROR を記録する', async () => {
      seedTrigger({ tabId: 88 })
      mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

      await handleMessage(
        { type: 'SEND_SCRAPED_BOOKS', books: testBooks } satisfies SendScrapedBooksMessage,
        mockSender,
      )

      expect(chrome.tabs.remove).toHaveBeenCalledWith(88)
      expect(mockSessionData.has('bookhub_kindle_trigger')).toBe(false)
      const result = mockStorageData.get('bookhub_last_sync_result') as Record<string, unknown>
      expect(result).toMatchObject({
        status: 'error',
        errorCode: 'NETWORK_ERROR',
      })
    })

    it('chrome.tabs.remove が throw しても flag は必ず clear される', async () => {
      seedTrigger({ tabId: 88 })
      ;(chrome.tabs.remove as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('No tab with id'),
      )
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ savedCount: 1, duplicateCount: 0, duplicates: [] }),
      })

      await handleMessage(
        { type: 'SEND_SCRAPED_BOOKS', books: testBooks } satisfies SendScrapedBooksMessage,
        mockSender,
      )

      expect(mockSessionData.has('bookhub_kindle_trigger')).toBe(false)
    })

    it('trigger flag が無い手動経路では tabs.remove は呼ばれず lastSyncResult のみ書く', async () => {
      // trigger flag セットしない
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ savedCount: 1, duplicateCount: 0, duplicates: [] }),
      })

      await handleMessage(
        { type: 'SEND_SCRAPED_BOOKS', books: testBooks } satisfies SendScrapedBooksMessage,
        mockSender,
      )

      expect(chrome.tabs.remove).not.toHaveBeenCalled()
      const result = mockStorageData.get('bookhub_last_sync_result') as Record<string, unknown>
      expect(result).toMatchObject({ status: 'success' })
      // trigger 由来のフィールドは未設定
      expect(result.trigger).toBeUndefined()
    })
  })

  describe('chrome.storage.session access level (content script 連携)', () => {
    it('background 起動時に setAccessLevel(TRUSTED_AND_UNTRUSTED_CONTEXTS) を呼ぶ', () => {
      // import 時 (一度だけ実行される) の引数を capturedSetAccessLevelCalls に退避済み。
      expect(capturedSetAccessLevelCalls).toContainEqual({
        accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
      })
    })
  })

  describe('chrome.tabs.onRemoved listener (handleTabRemoved)', () => {
    it('該当 tabId が閉じられると flag を clear し lastSyncResult にエラーを書く', async () => {
      const startedAt = Date.now() - 5000
      mockSessionData.set('bookhub_kindle_trigger', {
        tabId: 77,
        startedAt,
        source: 'web',
        store: 'kindle',
      })

      await handleTabRemoved(77)

      expect(mockSessionData.has('bookhub_kindle_trigger')).toBe(false)
      const result = mockStorageData.get('bookhub_last_sync_result') as Record<string, unknown>
      expect(result).toMatchObject({
        status: 'error',
        errorCode: 'UNKNOWN_ERROR',
        trigger: 'web',
        store: 'kindle',
      })
      // duration は記録されている
      expect(result.durationMs).toBeGreaterThanOrEqual(0)
    })

    it('別の tabId が閉じられたときは何もしない', async () => {
      mockSessionData.set('bookhub_kindle_trigger', {
        tabId: 77,
        startedAt: Date.now(),
        source: 'web',
        store: 'kindle',
      })

      await handleTabRemoved(99)

      // flag は維持される
      expect(mockSessionData.has('bookhub_kindle_trigger')).toBe(true)
      // lastSyncResult は書かれない
      expect(mockStorageData.get('bookhub_last_sync_result')).toBeUndefined()
    })

    it('flag が無い状態で onRemoved が来ても何も起きない', async () => {
      await handleTabRemoved(123)
      expect(mockStorageData.get('bookhub_last_sync_result')).toBeUndefined()
    })
  })
})
