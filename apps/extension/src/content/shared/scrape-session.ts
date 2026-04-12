import type { ScrapeBook } from '@bookhub/shared'

// Kindle ページネーションの累積スクレイピングセッションの状態管理。
// 純粋関数として副作用なしに実装し、ユニットテスト容易性を確保する。

export const STALE_TTL_MS = 5 * 60 * 1000 // 5 分: ユーザーが中断したセッションを破棄するまでの猶予
export const MAX_PAGES = 50 // 暴走防止の上限ページ数 (1 ページ 25 冊として 1,250 冊相当)
export const MAX_BOOKS_PER_REQUEST = 500 // packages/shared の scrapePayloadSchema.books.max(500) と一致

export interface ScrapeSession {
  /** Date.now() でセッションを開始した時刻 */
  startedAt: number
  /** セッション開始時の URL (pageNumber クエリを除いた canonical 形) */
  originalUrl: string
  /** 直近で処理を完了したページ番号 (新規セッションは 0) */
  lastPageScraped: number
  /** 累積した書籍 (parseBooks 後の ScrapeBook[]) */
  books: ScrapeBook[]
  /** 重複排除キー (Set は JSON 化できないので配列で保存) */
  seenKeys: string[]
}

/** URL から pageNumber クエリを取り出す。不正値・未指定は 1 にフォールバック */
export function extractPageNumber(url: string): number {
  try {
    const u = new URL(url)
    const raw = u.searchParams.get('pageNumber')
    if (raw === null) return 1
    const n = Number(raw)
    if (!Number.isInteger(n) || n < 1) return 1
    return n
  } catch {
    return 1
  }
}

/** URL の pageNumber クエリを書き換える (なければ追加) */
export function buildPageUrl(url: string, pageNumber: number): string {
  const u = new URL(url)
  u.searchParams.set('pageNumber', String(pageNumber))
  return u.toString()
}

/** URL から pageNumber を除いた canonical 形を返す (originalUrl の比較用) */
export function canonicalUrl(url: string): string {
  const u = new URL(url)
  u.searchParams.delete('pageNumber')
  return u.toString()
}

/** TTL を超過しているか判定 */
export function isSessionStale(session: ScrapeSession, now: number, ttlMs: number): boolean {
  return now - session.startedAt > ttlMs
}

/** 新規ページの書籍を既存セッションにマージする (重複排除) */
export function mergeBooks(
  existing: ScrapeBook[],
  newBooks: ScrapeBook[],
  seen: Set<string>,
): { books: ScrapeBook[]; seenKeys: Set<string> } {
  const merged = [...existing]
  const newSeen = new Set(seen)
  for (const book of newBooks) {
    const key = `${book.title}|${book.author}|${book.volumeNumber ?? 'null'}`
    if (newSeen.has(key)) continue
    newSeen.add(key)
    merged.push(book)
  }
  return { books: merged, seenKeys: newSeen }
}

/** 暴走防止: 上限到達なら true (強制送信のシグナル) */
export function shouldStopForSafety(bookCount: number, pageNumber: number): boolean {
  return bookCount >= MAX_BOOKS_PER_REQUEST || pageNumber >= MAX_PAGES
}

/** 空セッションを生成 */
export function createEmptySession(currentUrl: string, now: number): ScrapeSession {
  return {
    startedAt: now,
    originalUrl: canonicalUrl(currentUrl),
    lastPageScraped: 0,
    books: [],
    seenKeys: [],
  }
}
