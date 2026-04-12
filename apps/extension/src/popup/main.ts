import { getAccessToken, getLastSyncResult } from '../utils/storage.js'

document.addEventListener('DOMContentLoaded', async () => {
  const authStatusEl = document.getElementById('auth-status')
  const syncStatusEl = document.getElementById('sync-status')
  const bookshelfLink = document.getElementById('bookshelf-link') as HTMLAnchorElement | null

  // 本棚リンク URL
  if (bookshelfLink) {
    bookshelfLink.href = `${__API_BASE_URL__}/bookshelf`
  }

  // 認証状態
  if (authStatusEl) {
    const token = await getAccessToken()
    if (token) {
      authStatusEl.textContent = 'ログイン中'
      authStatusEl.className = 'status status-auth-ok'
    } else {
      authStatusEl.textContent = '未ログイン - Web アプリでログインしてください'
      authStatusEl.className = 'status status-auth-none'
    }
  }

  // 同期結果
  if (syncStatusEl) {
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
})
