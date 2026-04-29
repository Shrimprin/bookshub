import { scrapePayloadSchema, externalExtensionMessageSchema } from '@bookhub/shared'
import type { ScrapeResponse, ExternalMessageResponse, TriggerScrapeMessage } from '@bookhub/shared'
import type { ExtensionMessage, MessageResponse, SyncResult } from '../types/messages.js'
import {
  getAccessToken,
  setAccessToken,
  removeAccessToken,
  setLastSyncResult,
  getKindleScrapeTrigger,
  setKindleScrapeTrigger,
  clearKindleScrapeTrigger,
  getScrapeSession,
} from '../utils/storage.js'
import { TRIGGER_TTL_MS } from '../utils/constants.js'
import type { ErrorCode } from '../types/messages.js'

// Web 本棚から trigger を受け付けたとき、開くべき URL とコンテンツスクリプトの match パターン。
// 将来 'dmm' 等を追加する場合はこの registry にエントリを足し、TriggerScrapeMessage の
// store enum を拡張する。pageNumber=1 を URL に含めることで、kindle.ts 側の
// loadOrCreateSession の「ページ 1 で既存セッションを破棄」分岐に乗せる。
const STORE_REGISTRY = {
  kindle: {
    triggerUrl:
      'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/?pageNumber=1',
  },
} as const satisfies Record<TriggerScrapeMessage['store'], { triggerUrl: string }>

// --- Service Worker 初期化 ---

chrome.runtime.onInstalled.addListener(() => {
  console.log('[BookHub] Extension installed')
})

// chrome.storage.session はデフォルトで content script からアクセス不可。
// Kindle content script (kindle.ts) が trigger flag を読めるよう、明示的に
// TRUSTED_AND_UNTRUSTED_CONTEXTS を設定する。設定は Chrome に永続化されるが、
// SW 再起動・拡張更新時にも確実に有効化するためトップレベルで毎回呼ぶ。
// (idempotent な操作で副作用なし)
try {
  void chrome.storage.session.setAccessLevel({
    accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS',
  })
} catch {
  // 古い Chrome バージョン等で setAccessLevel 未対応の場合に備え握りつぶす。
  // その場合は trigger flag の読み取りが失敗するが、kindle.ts 側で
  // try/catch せず main() failed として記録されるので問題が顕在化する。
}

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
    return { success: false, error: '許可されていない送信元です', code: 'INVALID_ORIGIN' }
  }

  // 2. メッセージ形式バリデーション (Zod)
  const parsed = externalExtensionMessageSchema.safeParse(message)
  if (!parsed.success) {
    return {
      success: false,
      error: `不正なメッセージ形式: ${parsed.error.issues[0]?.message ?? 'unknown'}`,
      code: 'INVALID_MESSAGE',
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
    case 'TRIGGER_SCRAPE':
      return await triggerScrape(parsed.data.store)
  }
}

async function triggerScrape(
  store: TriggerScrapeMessage['store'],
): Promise<ExternalMessageResponse> {
  const config = STORE_REGISTRY[store]
  if (!config) {
    // Zod parse で弾かれるはずだが、防衛的に
    return { success: false, error: '対応していないストアです', code: 'UNSUPPORTED_STORE' }
  }

  // 重複ガード: 既存 trigger flag が「TTL 内 + タブ生存」であれば作り直さない
  const existing = await getKindleScrapeTrigger()
  if (existing) {
    const elapsed = Date.now() - existing.startedAt
    let alive = false
    if (elapsed < TRIGGER_TTL_MS) {
      try {
        await chrome.tabs.get(existing.tabId)
        alive = true
      } catch {
        alive = false
      }
    }
    if (alive) {
      return {
        success: false,
        error: '取り込みが既に進行中です',
        code: 'ALREADY_IN_PROGRESS',
      }
    }
    // 孤児 flag を回収して新規作成へ
    await clearKindleScrapeTrigger()
  }

  // 新規タブを background で開く。pageNumber=1 を含む URL なので、
  // kindle.ts 側の loadOrCreateSession が旧セッションを破棄して新規開始する。
  const tab = await chrome.tabs.create({ url: config.triggerUrl, active: false })
  if (typeof tab.id !== 'number') {
    return { success: false, error: 'タブの作成に失敗しました', code: 'TAB_CREATE_FAILED' }
  }

  await setKindleScrapeTrigger({
    tabId: tab.id,
    startedAt: Date.now(),
    source: 'web',
    store,
  })

  return { success: true }
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

// ユーザーが trigger 経由で開いたタブを手動で閉じた場合に、
// 孤児 flag を残さないよう回収し、Web 側に状況を伝えるため lastSyncResult にエラーを書く。
// service worker が dormant 復帰しても addListener はトップレベル登録なので再登録される。
chrome.tabs.onRemoved.addListener((tabId: number) => {
  void handleTabRemoved(tabId)
})

export async function handleTabRemoved(tabId: number): Promise<void> {
  const trigger = await getKindleScrapeTrigger()
  if (!trigger || trigger.tabId !== tabId) return

  const now = Date.now()
  await clearKindleScrapeTrigger()
  await setLastSyncResult({
    status: 'error',
    savedCount: 0,
    duplicateCount: 0,
    duplicates: [],
    error: 'タブが閉じられました',
    errorCode: 'UNKNOWN_ERROR',
    timestamp: now,
    trigger: trigger.source,
    startedAt: trigger.startedAt,
    durationMs: now - trigger.startedAt,
    store: trigger.store,
  })
}

// --- スクレイピングデータ送信 ---

// scrape の終了パスをすべて通す共通クリーンアップ。
// trigger flag があれば対応タブを閉じる (failure含む) + flag clear し、
// observability フィールド (durationMs, pagesScraped, trigger, store) を
// lastSyncResult に必ず付与する。
async function cleanupAndRecordResult(
  partial: Pick<
    SyncResult,
    'status' | 'savedCount' | 'duplicateCount' | 'duplicates' | 'error' | 'errorCode'
  >,
): Promise<void> {
  const trigger = await getKindleScrapeTrigger()
  const session = await getScrapeSession()
  const now = Date.now()

  if (trigger?.tabId !== undefined) {
    try {
      await chrome.tabs.remove(trigger.tabId)
    } catch {
      // タブが既に閉じられているケース等は握りつぶす。
      // flag clear は必ず後段で実行されるので状態は確実に進む。
    }
  }
  await clearKindleScrapeTrigger()

  await setLastSyncResult({
    ...partial,
    timestamp: now,
    trigger: trigger?.source,
    startedAt: trigger?.startedAt,
    durationMs: trigger ? now - trigger.startedAt : undefined,
    pagesScraped: session?.lastPageScraped,
    store: trigger?.store,
  })
}

async function handleSendScrapedBooks(books: unknown[]): Promise<MessageResponse<ScrapeResponse>> {
  // 1. 認証トークン取得
  const token = await getAccessToken()
  if (!token) {
    await cleanupAndRecordResult({
      status: 'error',
      savedCount: 0,
      duplicateCount: 0,
      duplicates: [],
      error: '未認証: ログインが必要です',
      errorCode: 'AUTH_ERROR',
    })
    return { success: false, error: '未認証: ログインが必要です', code: 'AUTH_ERROR' }
  }

  // 2. バリデーション
  const parsed = scrapePayloadSchema.safeParse({ books })
  if (!parsed.success) {
    const errMsg = `バリデーションエラー: ${parsed.error.issues[0]?.message ?? '不正なデータ'}`
    await cleanupAndRecordResult({
      status: 'error',
      savedCount: 0,
      duplicateCount: 0,
      duplicates: [],
      error: errMsg,
      errorCode: 'VALIDATION_ERROR',
    })
    return { success: false, error: errMsg, code: 'VALIDATION_ERROR' }
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
    await cleanupAndRecordResult({
      status: 'error',
      savedCount: 0,
      duplicateCount: 0,
      duplicates: [],
      error: 'ネットワークエラーが発生しました',
      errorCode: 'NETWORK_ERROR',
    })
    return { success: false, error: 'ネットワークエラーが発生しました', code: 'NETWORK_ERROR' }
  }

  // 4. レスポンスハンドリング
  if (!response.ok) {
    let errorCode: ErrorCode
    let errMsg: string
    if (response.status === 401) {
      // 期限切れトークンを storage から削除して、次回 sendScrapedBooks 時に
      // 早期 return (token === null) で AUTH_ERROR を返せるようにする。
      await removeAccessToken()
      errorCode = 'AUTH_ERROR'
      errMsg = '認証エラー: 再ログインが必要です'
    } else if (response.status === 400) {
      errorCode = 'VALIDATION_ERROR'
      errMsg = 'サーバーバリデーションエラー'
    } else {
      errorCode = 'API_ERROR'
      errMsg = 'サーバーエラーが発生しました'
    }
    await cleanupAndRecordResult({
      status: 'error',
      savedCount: 0,
      duplicateCount: 0,
      duplicates: [],
      error: errMsg,
      errorCode,
    })
    return { success: false, error: errMsg, code: errorCode }
  }

  const data = (await response.json()) as ScrapeResponse

  // 5. 同期結果を保存 (cleanupAndRecordResult が tab を閉じ flag を clear する)
  let status: SyncResult['status']
  if (data.savedCount > 0 && data.duplicateCount === 0) {
    status = 'success'
  } else if (data.savedCount > 0 && data.duplicateCount > 0) {
    status = 'partial'
  } else {
    // savedCount === 0: 全て重複 or 空データ
    status = 'partial'
  }
  await cleanupAndRecordResult({
    status,
    savedCount: data.savedCount,
    duplicateCount: data.duplicateCount,
    duplicates: data.duplicates,
  })

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
