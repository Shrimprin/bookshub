import { scrapePayloadSchema } from '@bookhub/shared'
import type { ScrapeResponse } from '@bookhub/shared'
import type { ExtensionMessage, MessageResponse, SyncResult } from '../types/messages.js'
import { getAccessToken, setLastSyncResult } from '../utils/storage.js'

// --- Service Worker 初期化 ---

chrome.runtime.onInstalled.addListener(() => {
  console.log('[BookHub] Extension installed')
})

// --- メッセージハンドラ（テスト用に export） ---

function isValidMessage(message: unknown): message is ExtensionMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    'type' in message &&
    typeof (message as { type: unknown }).type === 'string'
  )
}

export async function handleMessage(
  message: unknown,
  _sender: chrome.runtime.MessageSender, // eslint-disable-line @typescript-eslint/no-unused-vars
): Promise<MessageResponse<ScrapeResponse>> {
  if (!isValidMessage(message)) {
    return { success: false, error: '不正なメッセージ形式です', code: 'UNKNOWN_ERROR' }
  }

  switch (message.type) {
    case 'SEND_SCRAPED_BOOKS':
      return await handleSendScrapedBooks(message.books)
    case 'RELOAD_BOOKSHELF':
      await reloadBookshelfTabs()
      return { success: true, data: { savedCount: 0, duplicateCount: 0, duplicates: [] } }
    default:
      return { success: false, error: '不明なメッセージタイプです', code: 'UNKNOWN_ERROR' }
  }
}

// --- リスナーをトップレベルで登録 ---

chrome.runtime.onMessage.addListener(
  (message: unknown, sender: chrome.runtime.MessageSender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse)
    return true // 非同期レスポンスを有効化
  },
)

// --- スクレイピングデータ送信 ---

async function handleSendScrapedBooks(books: unknown[]): Promise<MessageResponse<ScrapeResponse>> {
  // 1. 認証トークン取得
  const token = await getAccessToken()
  if (!token) {
    return { success: false, error: '未認証: ログインが必要です', code: 'AUTH_ERROR' }
  }

  // 2. バリデーション
  const parsed = scrapePayloadSchema.safeParse({ books })
  if (!parsed.success) {
    return {
      success: false,
      error: `バリデーションエラー: ${parsed.error.issues[0]?.message ?? '不正なデータ'}`,
      code: 'VALIDATION_ERROR',
    }
  }

  // 3. API にPOST
  let response: Response
  try {
    response = await fetch(`${__API_BASE_URL__}/api/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ books: parsed.data.books }),
    })
  } catch {
    return { success: false, error: 'ネットワークエラーが発生しました', code: 'NETWORK_ERROR' }
  }

  // 4. レスポンスハンドリング
  if (!response.ok) {
    if (response.status === 401) {
      return { success: false, error: '認証エラー: 再ログインが必要です', code: 'AUTH_ERROR' }
    }
    if (response.status === 400) {
      return {
        success: false,
        error: 'サーバーバリデーションエラー',
        code: 'VALIDATION_ERROR',
      }
    }
    return { success: false, error: 'サーバーエラーが発生しました', code: 'API_ERROR' }
  }

  const data = (await response.json()) as ScrapeResponse

  // 5. 同期結果を保存
  let status: SyncResult['status']
  if (data.savedCount > 0 && data.duplicateCount === 0) {
    status = 'success'
  } else if (data.savedCount > 0 && data.duplicateCount > 0) {
    status = 'partial'
  } else {
    // savedCount === 0: 全て重複 or 空データ
    status = 'partial'
  }
  const syncResult: SyncResult = {
    status,
    savedCount: data.savedCount,
    duplicateCount: data.duplicateCount,
    duplicates: data.duplicates,
    timestamp: Date.now(),
  }
  await setLastSyncResult(syncResult)

  // 6. 本棚タブをリロード
  await reloadBookshelfTabs()

  return { success: true, data }
}

// --- 本棚タブリロード ---

async function reloadBookshelfTabs(): Promise<void> {
  const pattern = `${__API_BASE_URL__}/bookshelf*`
  const tabs = await chrome.tabs.query({ url: pattern })
  for (const tab of tabs) {
    if (tab.id !== undefined) {
      await chrome.tabs.reload(tab.id)
    }
  }
}
