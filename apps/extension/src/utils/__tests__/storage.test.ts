import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SyncResult } from '../../types/messages.js'
import type { ScrapeSession } from '../../content/shared/scrape-session.js'

// chrome.storage.local / chrome.storage.session のモック
const mockStorage = new Map<string, unknown>()
const mockSessionStorage = new Map<string, unknown>()

function makeAreaMock(store: Map<string, unknown>) {
  return {
    get: vi.fn((keys: string[]) => {
      const result: Record<string, unknown> = {}
      for (const key of keys) {
        const value = store.get(key)
        if (value !== undefined) {
          result[key] = value
        }
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
  }
}

const chromeStorageMock = {
  storage: {
    local: makeAreaMock(mockStorage),
    session: makeAreaMock(mockSessionStorage),
  },
}

vi.stubGlobal('chrome', chromeStorageMock)

describe('storage', () => {
  let storage: typeof import('../storage.js')

  beforeEach(async () => {
    mockStorage.clear()
    mockSessionStorage.clear()
    vi.clearAllMocks()
    storage = await import('../storage.js')
  })

  describe('getAccessToken', () => {
    it('トークンが保存されていない場合 null を返す', async () => {
      const token = await storage.getAccessToken()
      expect(token).toBeNull()
    })

    it('保存済みのトークンを返す', async () => {
      mockStorage.set('bookhub_access_token', 'test-token-123')
      const token = await storage.getAccessToken()
      expect(token).toBe('test-token-123')
    })
  })

  describe('setAccessToken', () => {
    it('トークンを保存できる', async () => {
      await storage.setAccessToken('my-token')
      expect(mockStorage.get('bookhub_access_token')).toBe('my-token')
    })

    it('chrome.storage.local.set が正しい引数で呼ばれる', async () => {
      await storage.setAccessToken('abc')
      expect(chromeStorageMock.storage.local.set).toHaveBeenCalledWith({
        bookhub_access_token: 'abc',
      })
    })
  })

  describe('removeAccessToken', () => {
    it('トークンを削除できる', async () => {
      mockStorage.set('bookhub_access_token', 'to-remove')
      await storage.removeAccessToken()
      expect(mockStorage.has('bookhub_access_token')).toBe(false)
    })

    it('chrome.storage.local.remove が正しい引数で呼ばれる', async () => {
      await storage.removeAccessToken()
      expect(chromeStorageMock.storage.local.remove).toHaveBeenCalledWith(['bookhub_access_token'])
    })
  })

  describe('getLastSyncResult', () => {
    it('結果が保存されていない場合 null を返す', async () => {
      const result = await storage.getLastSyncResult()
      expect(result).toBeNull()
    })

    it('保存済みの同期結果を返す', async () => {
      const syncResult: SyncResult = {
        status: 'success',
        savedCount: 5,
        duplicateCount: 2,
        duplicates: [{ title: 'テスト漫画', existingStores: ['kindle'] }],
        timestamp: Date.now(),
      }
      mockStorage.set('bookhub_last_sync_result', syncResult)

      const result = await storage.getLastSyncResult()
      expect(result).toEqual(syncResult)
    })
  })

  describe('setLastSyncResult', () => {
    it('同期結果を保存できる', async () => {
      const syncResult: SyncResult = {
        status: 'error',
        savedCount: 0,
        duplicateCount: 0,
        duplicates: [],
        error: 'ネットワークエラー',
        timestamp: Date.now(),
      }
      await storage.setLastSyncResult(syncResult)
      expect(mockStorage.get('bookhub_last_sync_result')).toEqual(syncResult)
    })
  })

  describe('getScrapeSession', () => {
    it('保存されていない場合 null を返す', async () => {
      const result = await storage.getScrapeSession()
      expect(result).toBeNull()
    })

    it('保存済みのセッションを返す', async () => {
      const session: ScrapeSession = {
        startedAt: 1700000000000,
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: 2,
        books: [],
        seenKeys: [],
      }
      mockStorage.set('bookhub_scrape_session_v1', session)
      const result = await storage.getScrapeSession()
      expect(result).toEqual(session)
    })

    it('startedAt が文字列の不正データは null を返す', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: '1700000000000',
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: 2,
        books: [],
        seenKeys: [],
      })
      const result = await storage.getScrapeSession()
      expect(result).toBeNull()
    })

    it('books が配列でない不正データは null を返す', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: 1700000000000,
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: 2,
        books: 'not-an-array',
        seenKeys: [],
      })
      const result = await storage.getScrapeSession()
      expect(result).toBeNull()
    })

    it('books に null 要素を含む不正データは null を返す', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: 1700000000000,
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: 2,
        books: [null, { title: 'ok', author: 'ok' }],
        seenKeys: [],
      })
      const result = await storage.getScrapeSession()
      expect(result).toBeNull()
    })

    it('books に title が文字列でない要素を含む不正データは null を返す', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: 1700000000000,
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: 2,
        books: [{ title: 123, author: 'ok' }],
        seenKeys: [],
      })
      const result = await storage.getScrapeSession()
      expect(result).toBeNull()
    })

    it('seenKeys に非文字列要素を含む不正データは null を返す', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: 1700000000000,
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: 2,
        books: [],
        seenKeys: ['ok', 123],
      })
      const result = await storage.getScrapeSession()
      expect(result).toBeNull()
    })

    it('null は null を返す', async () => {
      mockStorage.set('bookhub_scrape_session_v1', null)
      const result = await storage.getScrapeSession()
      expect(result).toBeNull()
    })

    it('books に store が欠けた要素があると null を返す', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: 1700000000000,
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: 2,
        books: [{ title: 'ok', author: 'ok', isAdult: false }],
        seenKeys: [],
      })
      expect(await storage.getScrapeSession()).toBeNull()
    })

    it('books に isAdult が欠けた要素があると null を返す', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: 1700000000000,
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: 2,
        books: [{ title: 'ok', author: 'ok', store: 'kindle' }],
        seenKeys: [],
      })
      expect(await storage.getScrapeSession()).toBeNull()
    })

    it('books の volumeNumber が範囲外なら null を返す', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: 1700000000000,
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: 2,
        books: [
          { title: 'ok', author: 'ok', store: 'kindle', isAdult: false, volumeNumber: 100000 },
        ],
        seenKeys: [],
      })
      expect(await storage.getScrapeSession()).toBeNull()
    })

    it('startedAt が NaN なら null を返す', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: NaN,
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: 2,
        books: [],
        seenKeys: [],
      })
      expect(await storage.getScrapeSession()).toBeNull()
    })

    it('lastPageScraped が負数なら null を返す', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: 1700000000000,
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: -1,
        books: [],
        seenKeys: [],
      })
      expect(await storage.getScrapeSession()).toBeNull()
    })

    it('originalUrl が空文字なら null を返す', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: 1700000000000,
        originalUrl: '',
        lastPageScraped: 2,
        books: [],
        seenKeys: [],
      })
      expect(await storage.getScrapeSession()).toBeNull()
    })
  })

  describe('setScrapeSession', () => {
    it('セッションを保存できる', async () => {
      const session: ScrapeSession = {
        startedAt: 1700000000000,
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: 1,
        books: [],
        seenKeys: [],
      }
      await storage.setScrapeSession(session)
      expect(mockStorage.get('bookhub_scrape_session_v1')).toEqual(session)
    })
  })

  describe('clearScrapeSession', () => {
    it('セッションを削除できる', async () => {
      const session: ScrapeSession = {
        startedAt: 1700000000000,
        originalUrl: 'https://www.amazon.co.jp/foo',
        lastPageScraped: 1,
        books: [],
        seenKeys: [],
      }
      mockStorage.set('bookhub_scrape_session_v1', session)
      await storage.clearScrapeSession()
      expect(mockStorage.has('bookhub_scrape_session_v1')).toBe(false)
    })
  })

  describe('getKindleScrapeTrigger', () => {
    it('未設定なら null を返す', async () => {
      const result = await storage.getKindleScrapeTrigger()
      expect(result).toBeNull()
    })

    it('保存済みの trigger を返す', async () => {
      const trigger = { tabId: 42, startedAt: 1700000000000, source: 'web', store: 'kindle' }
      mockSessionStorage.set('bookhub_kindle_trigger', trigger)
      const result = await storage.getKindleScrapeTrigger()
      expect(result).toEqual(trigger)
    })

    it('chrome.storage.session を使う (local ではない)', async () => {
      // 永続化したくないので session 領域を使う設計
      mockStorage.set('bookhub_kindle_trigger', {
        tabId: 42,
        startedAt: 1,
        source: 'web',
        store: 'kindle',
      })
      const result = await storage.getKindleScrapeTrigger()
      expect(result).toBeNull()
    })

    it('tabId が文字列の不正データは null を返す', async () => {
      mockSessionStorage.set('bookhub_kindle_trigger', {
        tabId: '42',
        startedAt: 1700000000000,
        source: 'web',
        store: 'kindle',
      })
      expect(await storage.getKindleScrapeTrigger()).toBeNull()
    })

    it('startedAt が NaN の不正データは null を返す', async () => {
      mockSessionStorage.set('bookhub_kindle_trigger', {
        tabId: 42,
        startedAt: NaN,
        source: 'web',
        store: 'kindle',
      })
      expect(await storage.getKindleScrapeTrigger()).toBeNull()
    })

    it('source が未対応の値の不正データは null を返す', async () => {
      mockSessionStorage.set('bookhub_kindle_trigger', {
        tabId: 42,
        startedAt: 1,
        source: 'unknown',
        store: 'kindle',
      })
      expect(await storage.getKindleScrapeTrigger()).toBeNull()
    })

    it('store が未対応の値の不正データは null を返す', async () => {
      mockSessionStorage.set('bookhub_kindle_trigger', {
        tabId: 42,
        startedAt: 1,
        source: 'web',
        store: 'rakuten',
      })
      expect(await storage.getKindleScrapeTrigger()).toBeNull()
    })

    it('null は null を返す', async () => {
      mockSessionStorage.set('bookhub_kindle_trigger', null)
      expect(await storage.getKindleScrapeTrigger()).toBeNull()
    })
  })

  describe('setKindleScrapeTrigger', () => {
    it('trigger を session storage に保存できる', async () => {
      const trigger = {
        tabId: 99,
        startedAt: 1700000000000,
        source: 'web' as const,
        store: 'kindle' as const,
      }
      await storage.setKindleScrapeTrigger(trigger)
      expect(mockSessionStorage.get('bookhub_kindle_trigger')).toEqual(trigger)
    })

    it('chrome.storage.session.set が呼ばれる (local ではない)', async () => {
      await storage.setKindleScrapeTrigger({
        tabId: 1,
        startedAt: 1,
        source: 'web',
        store: 'kindle',
      })
      expect(chromeStorageMock.storage.session.set).toHaveBeenCalledWith({
        bookhub_kindle_trigger: { tabId: 1, startedAt: 1, source: 'web', store: 'kindle' },
      })
      expect(chromeStorageMock.storage.local.set).not.toHaveBeenCalledWith(
        expect.objectContaining({ bookhub_kindle_trigger: expect.anything() }),
      )
    })
  })

  describe('clearKindleScrapeTrigger', () => {
    it('trigger を削除できる', async () => {
      mockSessionStorage.set('bookhub_kindle_trigger', {
        tabId: 1,
        startedAt: 1,
        source: 'web',
        store: 'kindle',
      })
      await storage.clearKindleScrapeTrigger()
      expect(mockSessionStorage.has('bookhub_kindle_trigger')).toBe(false)
    })
  })

  describe('SyncResult 拡張フィールド (後方互換)', () => {
    it('observability フィールドを含む SyncResult を保存・取得できる', async () => {
      const syncResult: SyncResult = {
        status: 'error',
        savedCount: 0,
        duplicateCount: 0,
        duplicates: [],
        error: 'タブが閉じられました',
        errorCode: 'UNKNOWN_ERROR',
        timestamp: 1700000000000,
        trigger: 'web',
        startedAt: 1699999000000,
        durationMs: 1000000,
        pagesScraped: 3,
        store: 'kindle',
      }
      await storage.setLastSyncResult(syncResult)
      const result = await storage.getLastSyncResult()
      expect(result).toEqual(syncResult)
    })

    it('旧フィールドのみの SyncResult も読み込める (後方互換)', async () => {
      const legacy = {
        status: 'success',
        savedCount: 5,
        duplicateCount: 0,
        duplicates: [],
        timestamp: 1,
      }
      mockStorage.set('bookhub_last_sync_result', legacy)
      const result = await storage.getLastSyncResult()
      expect(result).toEqual(legacy)
    })
  })
})
