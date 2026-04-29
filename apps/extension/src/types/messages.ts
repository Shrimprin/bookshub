import type { ScrapeBook, ScrapeResponse, ScrapeDuplicate } from '@bookhub/shared'
import type { ScrapeStore, ScrapeTriggerSource } from '../utils/constants.js'

// --- エラーコード ---

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTH_ERROR'
  | 'NETWORK_ERROR'
  | 'API_ERROR'
  | 'UNKNOWN_ERROR'

// --- メッセージレスポンス（判別共用体） ---

export type MessageResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; code: ErrorCode }

// --- Content Script → Background メッセージ ---

export interface SendScrapedBooksMessage {
  type: 'SEND_SCRAPED_BOOKS'
  books: ScrapeBook[]
}

export interface ReloadBookshelfMessage {
  type: 'RELOAD_BOOKSHELF'
}

// content script が「スクレイプを完走できない」と判定したときに送る通知。
// background は cleanupAndRecordResult を呼んで trigger flag / タブを clean up し、
// Web 側 (lastSyncResult) に経緯を記録する。
// reason は技術的な切り分け用 (UI には ERROR_MESSAGE_BY_CODE 経由で localize される)。
export type AbortScrapeReason = 'NO_DOM' | 'NO_BOOKS' | 'UNEXPECTED_ERROR'

export interface AbortScrapeMessage {
  type: 'ABORT_SCRAPE'
  reason: AbortScrapeReason
}

// content script から「自分が trigger タブか」を background に問い合わせる。
// chrome.tabs.getCurrent() は content script で動かないため、background が
// sender.tab.id を見て trigger.tabId と比較する RPC で代替する。
// 同一 trigger flag を立てたまま別タブで Kindle 購入履歴を手動訪問された
// ケースで、誤って tab 違いの content script がスクレイプを進めるのを防ぐ。
export interface IsTriggerTabMessage {
  type: 'IS_TRIGGER_TAB'
}

export type IsTriggerTabResponse =
  | { success: true; data: { match: boolean } }
  | { success: false; error: string; code: ErrorCode }

export type ExtensionMessage =
  | SendScrapedBooksMessage
  | ReloadBookshelfMessage
  | AbortScrapeMessage
  | IsTriggerTabMessage

// --- 同期結果（storage 保存用） ---

// status enum は既存値 (success/partial/error) を維持。エラー詳細は errorCode で分類する。
// 拡張フィールドはすべて optional とし、旧データの後方互換を保つ。
export interface SyncResult {
  status: 'success' | 'partial' | 'error'
  savedCount: number
  duplicateCount: number
  duplicates: ScrapeDuplicate[]
  error?: string
  timestamp: number
  // observability / trigger 経由情報 (Phase 5 で書き込み開始)
  errorCode?: ErrorCode
  trigger?: ScrapeTriggerSource
  startedAt?: number
  durationMs?: number
  pagesScraped?: number
  store?: ScrapeStore
}

// --- Background → Content Script レスポンス型 ---

export type SendScrapedBooksResponse = MessageResponse<ScrapeResponse>
