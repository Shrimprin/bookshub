import type { SyncResult } from '../types/messages.js'
import type { ScrapeSession } from '../content/shared/scrape-session.js'

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'bookhub_access_token',
  LAST_SYNC_RESULT: 'bookhub_last_sync_result',
  SCRAPE_SESSION: 'bookhub_scrape_session_v1',
} as const

export async function getAccessToken(): Promise<string | null> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.ACCESS_TOKEN])
  return (result[STORAGE_KEYS.ACCESS_TOKEN] as string | undefined) ?? null
}

export async function setAccessToken(token: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.ACCESS_TOKEN]: token })
}

export async function removeAccessToken(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEYS.ACCESS_TOKEN])
}

export async function getLastSyncResult(): Promise<SyncResult | null> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.LAST_SYNC_RESULT])
  return (result[STORAGE_KEYS.LAST_SYNC_RESULT] as SyncResult | undefined) ?? null
}

export async function setLastSyncResult(syncResult: SyncResult): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_SYNC_RESULT]: syncResult })
}

// 進行中の Kindle スクレイピングセッション (ページネーション全ページ累積)。
// Content Script は完全ナビゲーション (?pageNumber=N) で再起動するため、
// 状態を chrome.storage.local に保存して再開可能にする。

// runtime 型ガード: 部分書き込みやスキーマ変更で構造が崩れた値を検出する。
// books / seenKeys が undefined のまま使われると mergeBooks や Set コンストラクタで
// 静かに壊れるため、構造チェックで弾いて null 扱いにする。
function isScrapeSession(value: unknown): value is ScrapeSession {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return (
    typeof v.startedAt === 'number' &&
    typeof v.originalUrl === 'string' &&
    typeof v.lastPageScraped === 'number' &&
    Array.isArray(v.books) &&
    Array.isArray(v.seenKeys)
  )
}

export async function getScrapeSession(): Promise<ScrapeSession | null> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.SCRAPE_SESSION])
  const raw = result[STORAGE_KEYS.SCRAPE_SESSION]
  return isScrapeSession(raw) ? raw : null
}

export async function setScrapeSession(session: ScrapeSession): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SCRAPE_SESSION]: session })
}

export async function clearScrapeSession(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEYS.SCRAPE_SESSION])
}
