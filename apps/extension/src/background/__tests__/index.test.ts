import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ScrapeBook } from '@bookhub/shared'
import type { SendScrapedBooksMessage, ReloadBookshelfMessage } from '../../types/messages.js'

// --- chrome API モック ---

const mockStorageData = new Map<string, unknown>()

const mockTabs = [
  { id: 1, url: 'http://localhost:3000/bookshelf' },
  { id: 2, url: 'https://www.amazon.co.jp/kindle' },
]

const EXTENSION_ID = 'test-extension-id'

vi.stubGlobal('chrome', {
  runtime: {
    id: EXTENSION_ID,
    onInstalled: { addListener: vi.fn() },
    onMessage: { addListener: vi.fn() },
    lastError: null,
  },
  storage: {
    session: {
      get: vi.fn((keys: string[]) => {
        const result: Record<string, unknown> = {}
        for (const key of keys) {
          const value = mockStorageData.get(key)
          if (value !== undefined) result[key] = value
        }
        return Promise.resolve(result)
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) {
          mockStorageData.set(key, value)
        }
        return Promise.resolve()
      }),
      remove: vi.fn(),
    },
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
  },
})

// --- fetch モック ---

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// --- __API_BASE_URL__ モック ---

vi.stubGlobal('__API_BASE_URL__', 'http://localhost:3000')

describe('background', () => {
  let handleMessage: (message: unknown, sender: chrome.runtime.MessageSender) => Promise<unknown>

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
    mockStorageData.set('bookhub_access_token', 'test-token')

    // background/index.ts を import するとリスナーが登録される
    // onMessage.addListener に渡された関数を取り出す
    const bg = await import('../index.js')
    handleMessage = bg.handleMessage
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

      it('API が 401 を返す場合 AUTH_ERROR を返す', async () => {
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
})
