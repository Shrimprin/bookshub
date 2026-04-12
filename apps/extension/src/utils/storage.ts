import type { SyncResult } from '../types/messages.js'
import type { ScrapeSession } from '../content/shared/scrape-session.js'

const STORAGE_KEYS = {
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
export async function getScrapeSession(): Promise<ScrapeSession | null> {
  const result = await chrome.storage.local.get([STORAGE_KEYS.SCRAPE_SESSION])
  return (result[STORAGE_KEYS.SCRAPE_SESSION] as ScrapeSession | undefined) ?? null
}

export async function setScrapeSession(session: ScrapeSession): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SCRAPE_SESSION]: session })
}

export async function clearScrapeSession(): Promise<void> {
  await chrome.storage.local.remove([STORAGE_KEYS.SCRAPE_SESSION])
}
