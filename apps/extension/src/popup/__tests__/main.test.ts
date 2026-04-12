// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'

// --- chrome API モック ---
const mockStorageData = new Map<string, unknown>()

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn((keys: string[]) => {
        const result: Record<string, unknown> = {}
        for (const key of keys) {
          const value = mockStorageData.get(key)
          if (value !== undefined) result[key] = value
        }
        return Promise.resolve(result)
      }),
      set: vi.fn(),
      remove: vi.fn(),
    },
    onChanged: { addListener: vi.fn() },
  },
})

describe('popup main', () => {
  let renderAuthStatus: (el: HTMLElement | null) => Promise<void>
  let renderSyncStatus: (el: HTMLElement | null) => Promise<void>

  beforeEach(async () => {
    vi.clearAllMocks()
    mockStorageData.clear()
    document.body.innerHTML = ''
    const mod = await import('../main.js')
    renderAuthStatus = mod.renderAuthStatus
    renderSyncStatus = mod.renderSyncStatus
  })

  describe('renderAuthStatus', () => {
    it('トークンがある場合は「ログイン中」を表示する', async () => {
      mockStorageData.set('bookhub_access_token', 'some-token')
      const el = document.createElement('span')
      await renderAuthStatus(el)
      expect(el.textContent).toBe('ログイン中')
      expect(el.className).toBe('status status-auth-ok')
    })

    it('トークンがない場合は「未ログイン」メッセージを表示する', async () => {
      mockStorageData.delete('bookhub_access_token')
      const el = document.createElement('span')
      await renderAuthStatus(el)
      expect(el.textContent).toContain('未ログイン')
      expect(el.className).toBe('status status-auth-none')
    })

    it('要素が null の場合は何もしない', async () => {
      await expect(renderAuthStatus(null)).resolves.toBeUndefined()
    })

    it('トークンの有無が変わると再描画で表示が切り替わる', async () => {
      const el = document.createElement('span')

      // 初期状態: 未ログイン
      mockStorageData.delete('bookhub_access_token')
      await renderAuthStatus(el)
      expect(el.textContent).toContain('未ログイン')

      // Web からトークンが送信された
      mockStorageData.set('bookhub_access_token', 'new-token')
      await renderAuthStatus(el)
      expect(el.textContent).toBe('ログイン中')

      // ログアウト
      mockStorageData.delete('bookhub_access_token')
      await renderAuthStatus(el)
      expect(el.textContent).toContain('未ログイン')
    })
  })

  describe('renderSyncStatus', () => {
    it('同期結果がない場合は「まだ同期が行われていません」を表示する', async () => {
      const el = document.createElement('span')
      await renderSyncStatus(el)
      expect(el.textContent).toBe('まだ同期が行われていません')
    })

    it('success 状態を表示する', async () => {
      mockStorageData.set('bookhub_last_sync_result', {
        status: 'success',
        savedCount: 5,
        duplicateCount: 0,
        duplicates: [],
        timestamp: Date.now(),
      })
      const el = document.createElement('span')
      await renderSyncStatus(el)
      expect(el.textContent).toContain('5冊を同期しました')
      expect(el.className).toBe('status status-success')
    })

    it('partial 状態を表示する', async () => {
      mockStorageData.set('bookhub_last_sync_result', {
        status: 'partial',
        savedCount: 3,
        duplicateCount: 2,
        duplicates: [],
        timestamp: Date.now(),
      })
      const el = document.createElement('span')
      await renderSyncStatus(el)
      expect(el.textContent).toContain('3冊を同期しました')
      expect(el.textContent).toContain('重複: 2冊')
    })
  })
})
