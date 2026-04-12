import {
  clearScrapeSession,
  getAccessToken,
  getLastSyncResult,
  getScrapeSession,
} from '../utils/storage.js'

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'bookhub_access_token',
  LAST_SYNC_RESULT: 'bookhub_last_sync_result',
  SCRAPE_SESSION: 'bookhub_scrape_session_v1',
} as const

export async function renderAuthStatus(authStatusEl: HTMLElement | null): Promise<void> {
  if (!authStatusEl) return
  const token = await getAccessToken()
  if (token) {
    authStatusEl.textContent = 'ログイン中'
    authStatusEl.className = 'status status-auth-ok'
  } else {
    authStatusEl.textContent = '未ログイン - Web アプリでログインしてください'
    authStatusEl.className = 'status status-auth-none'
  }
}

export async function renderSyncStatus(syncStatusEl: HTMLElement | null): Promise<void> {
  if (!syncStatusEl) return
  const result = await getLastSyncResult()
  if (!result) {
    syncStatusEl.textContent = 'まだ同期が行われていません'
    syncStatusEl.className = 'status status-none'
    return
  }

  const date = new Date(result.timestamp).toLocaleString('ja-JP')

  switch (result.status) {
    case 'success':
      syncStatusEl.textContent = `${result.savedCount}冊を同期しました（${date}）`
      syncStatusEl.className = 'status status-success'
      break
    case 'partial':
      syncStatusEl.textContent = `${result.savedCount}冊を同期しました（重複: ${result.duplicateCount}冊）（${date}）`
      syncStatusEl.className = 'status status-partial'
      break
    case 'error':
      syncStatusEl.textContent = `同期エラー: ${result.error ?? '不明なエラー'}（${date}）`
      syncStatusEl.className = 'status status-error'
      break
  }
}

export async function renderScrapeProgress(
  progressEl: HTMLElement | null,
  resetBtn: HTMLElement | null,
): Promise<void> {
  const session = await getScrapeSession()
  if (!session) {
    if (progressEl) {
      progressEl.hidden = true
      progressEl.textContent = ''
    }
    if (resetBtn) resetBtn.hidden = true
    return
  }
  if (progressEl) {
    progressEl.hidden = false
    progressEl.textContent = `Kindle 同期中: ページ ${session.lastPageScraped} まで完了 / ${session.books.length} 冊蓄積`
    progressEl.className = 'status status-partial'
  }
  if (resetBtn) resetBtn.hidden = false
}

document.addEventListener('DOMContentLoaded', async () => {
  const authStatusEl = document.getElementById('auth-status')
  const syncStatusEl = document.getElementById('sync-status')
  const progressEl = document.getElementById('scrape-progress')
  const resetBtn = document.getElementById('reset-scrape-session')
  const bookshelfLink = document.getElementById('bookshelf-link') as HTMLAnchorElement | null

  // 本棚リンク URL
  if (bookshelfLink) {
    bookshelfLink.href = `${__API_BASE_URL__}/bookshelf`
  }

  // 初期描画
  await renderAuthStatus(authStatusEl)
  await renderSyncStatus(syncStatusEl)
  await renderScrapeProgress(progressEl, resetBtn)

  // リセットボタン
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      await clearScrapeSession()
      await renderScrapeProgress(progressEl, resetBtn)
    })
  }

  // storage の変更を監視して popup を開いたまま状態を最新化する
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return
    if (STORAGE_KEYS.ACCESS_TOKEN in changes) {
      void renderAuthStatus(authStatusEl)
    }
    if (STORAGE_KEYS.LAST_SYNC_RESULT in changes) {
      void renderSyncStatus(syncStatusEl)
    }
    if (STORAGE_KEYS.SCRAPE_SESSION in changes) {
      void renderScrapeProgress(progressEl, resetBtn)
    }
  })
})
