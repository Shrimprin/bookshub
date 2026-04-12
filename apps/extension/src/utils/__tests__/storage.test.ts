import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SyncResult } from '../../types/messages.js'

// chrome.storage.session のモック
const mockStorage = new Map<string, unknown>()

const chromeStorageMock = {
  storage: {
    session: {
      get: vi.fn((keys: string[]) => {
        const result: Record<string, unknown> = {}
        for (const key of keys) {
          const value = mockStorage.get(key)
          if (value !== undefined) {
            result[key] = value
          }
        }
        return Promise.resolve(result)
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) {
          mockStorage.set(key, value)
        }
        return Promise.resolve()
      }),
      remove: vi.fn((keys: string[]) => {
        for (const key of keys) {
          mockStorage.delete(key)
        }
        return Promise.resolve()
      }),
    },
  },
}

vi.stubGlobal('chrome', chromeStorageMock)

describe('storage', () => {
  let storage: typeof import('../storage.js')

  beforeEach(async () => {
    mockStorage.clear()
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

    it('chrome.storage.session.set が正しい引数で呼ばれる', async () => {
      await storage.setAccessToken('abc')
      expect(chromeStorageMock.storage.session.set).toHaveBeenCalledWith({
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

    it('chrome.storage.session.remove が正しい引数で呼ばれる', async () => {
      await storage.removeAccessToken()
      expect(chromeStorageMock.storage.session.remove).toHaveBeenCalledWith([
        'bookhub_access_token',
      ])
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
})
