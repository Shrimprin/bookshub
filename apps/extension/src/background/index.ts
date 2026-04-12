import { scrapePayloadSchema, externalExtensionMessageSchema } from '@bookhub/shared'
import type { ScrapeResponse, ExternalMessageResponse } from '@bookhub/shared'
import type { ExtensionMessage, MessageResponse, SyncResult } from '../types/messages.js'
import {
  getAccessToken,
  setAccessToken,
  removeAccessToken,
  setLastSyncResult,
} from '../utils/storage.js'

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
  sender: chrome.runtime.MessageSender,
): Promise<MessageResponse<ScrapeResponse>> {
  // 自拡張機能からのメッセージのみ受け付ける
  if (sender.id !== chrome.runtime.id) {
    return { success: false, error: '不正な送信元です', code: 'UNKNOWN_ERROR' }
  }

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

// --- 外部メッセージハンドラ (Web アプリからのトークン受け渡し) ---

function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return false
  return __ALLOWED_EXTERNAL_ORIGINS__.includes(origin)
}

export async function handleExternalMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<ExternalMessageResponse> {
  // 1. origin 検証 - 許可リストに載っていないオリジンからのメッセージは全て拒否
  if (!isAllowedOrigin(sender.origin)) {
    return { success: false, error: '許可されていない送信元です' }
  }

  // 2. メッセージ形式バリデーション (Zod)
  const parsed = externalExtensionMessageSchema.safeParse(message)
  if (!parsed.success) {
    return {
      success: false,
      error: `不正なメッセージ形式: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
    }
  }

  // 3. type 分岐
  switch (parsed.data.type) {
    case 'SET_ACCESS_TOKEN':
      await setAccessToken(parsed.data.token)
      return { success: true }
    case 'CLEAR_ACCESS_TOKEN':
      await removeAccessToken()
      return { success: true }
  }
}

// --- リスナーをトップレベルで登録 ---

chrome.runtime.onMessage.addListener(
  (message: unknown, sender: chrome.runtime.MessageSender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse)
    return true // 非同期レスポンスを有効化
  },
)

chrome.runtime.onMessageExternal.addListener(
  (message: unknown, sender: chrome.runtime.MessageSender, sendResponse) => {
    handleExternalMessage(message, sender).then(sendResponse)
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
      // 期限切れトークンを storage から削除して、次回 sendScrapedBooks 時に
      // 早期 return (token === null) で AUTH_ERROR を返せるようにする。
      // これにより popup の「ログイン中」表示も「未ログイン」に切り替わる。
      await removeAccessToken()
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
