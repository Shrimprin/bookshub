import type { SyncResult } from '../types/messages.js'
import type { ScrapeSession } from '../content/shared/scrape-session.js'
import type { ScrapeStore, ScrapeTriggerSource } from './constants.js'

export const STORAGE_KEYS = {
  ACCESS_TOKEN: 'bookhub_access_token',
  LAST_SYNC_RESULT: 'bookhub_last_sync_result',
  SCRAPE_SESSION: 'bookhub_scrape_session_v1',
  // chrome.storage.session 領域に保存。ブラウザ再起動で自動消滅させ、
  // 永続化による「孤児フラグで以後 trigger できない」事故を避ける。
  KINDLE_SCRAPE_TRIGGER: 'bookhub_kindle_trigger',
} as const

// Web 側ボタン押下で開始した Kindle スクレイプの進行中状態。
// tabId は終了時 (cleanup) と onRemoved 監視用。
// source / store は constants.ts と単一定義。型を分散させると追加時に
// SyncResult.trigger 等との整合が型レベルで取れなくなるため。
export type KindleScrapeTrigger = {
  tabId: number
  startedAt: number
  source: ScrapeTriggerSource
  store: ScrapeStore
}

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
//
// 配列要素は ScrapeBook の必須フィールド (title/author/store/isAdult) と
// volumeNumber の範囲 (1-9999, integer) まで検証する。
// startedAt/lastPageScraped は NaN/Infinity/負数を弾くため Number.isFinite/isInteger を使う。
function isScrapeBookLike(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const b = value as Record<string, unknown>
  if (typeof b.title !== 'string' || b.title.trim().length === 0) return false
  if (typeof b.author !== 'string' || b.author.trim().length === 0) return false
  if (typeof b.store !== 'string') return false
  if (typeof b.isAdult !== 'boolean') return false
  if (b.volumeNumber !== undefined) {
    if (
      typeof b.volumeNumber !== 'number' ||
      !Number.isInteger(b.volumeNumber) ||
      b.volumeNumber < 1 ||
      b.volumeNumber > 9999
    ) {
      return false
    }
  }
  if (b.thumbnailUrl !== undefined && typeof b.thumbnailUrl !== 'string') return false
  return true
}

function isScrapeSession(value: unknown): value is ScrapeSession {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.startedAt !== 'number' || !Number.isFinite(v.startedAt) || v.startedAt < 0) {
    return false
  }
  if (typeof v.originalUrl !== 'string' || v.originalUrl.length === 0) return false
  if (
    typeof v.lastPageScraped !== 'number' ||
    !Number.isInteger(v.lastPageScraped) ||
    v.lastPageScraped < 0
  ) {
    return false
  }
  if (!Array.isArray(v.books) || !v.books.every(isScrapeBookLike)) return false
  if (!Array.isArray(v.seenKeys) || !v.seenKeys.every((k) => typeof k === 'string')) return false
  return true
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

function isKindleScrapeTrigger(value: unknown): value is KindleScrapeTrigger {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.tabId !== 'number' || !Number.isInteger(v.tabId) || v.tabId < 0) return false
  if (typeof v.startedAt !== 'number' || !Number.isFinite(v.startedAt) || v.startedAt < 0) {
    return false
  }
  if (v.source !== 'web' && v.source !== 'auto') return false
  if (v.store !== 'kindle') return false
  return true
}

export async function getKindleScrapeTrigger(): Promise<KindleScrapeTrigger | null> {
  const result = await chrome.storage.session.get([STORAGE_KEYS.KINDLE_SCRAPE_TRIGGER])
  const raw = result[STORAGE_KEYS.KINDLE_SCRAPE_TRIGGER]
  return isKindleScrapeTrigger(raw) ? raw : null
}

export async function setKindleScrapeTrigger(value: KindleScrapeTrigger): Promise<void> {
  await chrome.storage.session.set({ [STORAGE_KEYS.KINDLE_SCRAPE_TRIGGER]: value })
}

export async function clearKindleScrapeTrigger(): Promise<void> {
  await chrome.storage.session.remove([STORAGE_KEYS.KINDLE_SCRAPE_TRIGGER])
}
