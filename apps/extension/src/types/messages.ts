import type { ScrapeBook, ScrapeResponse, ScrapeDuplicate } from '@bookhub/shared'

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

export type ExtensionMessage = SendScrapedBooksMessage | ReloadBookshelfMessage

// --- 同期結果（storage 保存用） ---

export interface SyncResult {
  status: 'success' | 'partial' | 'error'
  savedCount: number
  duplicateCount: number
  duplicates: ScrapeDuplicate[]
  error?: string
  timestamp: number
}

// --- Background → Content Script レスポンス型 ---

export type SendScrapedBooksResponse = MessageResponse<ScrapeResponse>
