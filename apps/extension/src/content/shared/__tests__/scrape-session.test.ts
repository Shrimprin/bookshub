import { describe, it, expect } from 'vitest'
import type { ScrapeBook } from '@bookhub/shared'
import {
  extractPageNumber,
  buildPageUrl,
  isSessionStale,
  mergeBooks,
  shouldStopForSafety,
  createEmptySession,
  STALE_TTL_MS,
  MAX_PAGES,
  MAX_BOOKS_PER_REQUEST,
  type ScrapeSession,
} from '../scrape-session.js'

const baseBook: ScrapeBook = {
  title: 'テスト漫画',
  author: 'テスト作者',
  volumeNumber: 1,
  store: 'kindle',
  isAdult: false,
}

describe('extractPageNumber', () => {
  it('?pageNumber=3 → 3', () => {
    expect(extractPageNumber('https://www.amazon.co.jp/foo?pageNumber=3')).toBe(3)
  })

  it('pageNumber が無い場合は 1', () => {
    expect(extractPageNumber('https://www.amazon.co.jp/foo')).toBe(1)
  })

  it('pageNumber が文字列の場合は 1', () => {
    expect(extractPageNumber('https://www.amazon.co.jp/foo?pageNumber=abc')).toBe(1)
  })

  it('pageNumber=0 は 1 にフォールバック', () => {
    expect(extractPageNumber('https://www.amazon.co.jp/foo?pageNumber=0')).toBe(1)
  })

  it('pageNumber=-5 は 1 にフォールバック', () => {
    expect(extractPageNumber('https://www.amazon.co.jp/foo?pageNumber=-5')).toBe(1)
  })

  it('他のクエリパラメータは無視', () => {
    expect(extractPageNumber('https://www.amazon.co.jp/foo?sort=date&pageNumber=5')).toBe(5)
  })
})

describe('buildPageUrl', () => {
  it('既存の pageNumber を置換する', () => {
    const result = buildPageUrl('https://www.amazon.co.jp/foo?pageNumber=1', 5)
    expect(result).toContain('pageNumber=5')
    expect(result).not.toContain('pageNumber=1')
  })

  it('pageNumber が無い URL に追加する', () => {
    const result = buildPageUrl('https://www.amazon.co.jp/foo', 2)
    expect(result).toContain('pageNumber=2')
  })

  it('他のクエリパラメータを保持する', () => {
    const result = buildPageUrl('https://www.amazon.co.jp/foo?sort=date&filter=all', 3)
    expect(result).toContain('sort=date')
    expect(result).toContain('filter=all')
    expect(result).toContain('pageNumber=3')
  })
})

describe('isSessionStale', () => {
  const now = 1_700_000_000_000
  const session: ScrapeSession = {
    startedAt: now - 1000,
    originalUrl: 'https://www.amazon.co.jp/foo',
    lastPageScraped: 1,
    books: [],
    seenKeys: [],
  }

  it('TTL 内なら false', () => {
    expect(isSessionStale(session, now, STALE_TTL_MS)).toBe(false)
  })

  it('TTL 超過なら true', () => {
    const oldSession = { ...session, startedAt: now - STALE_TTL_MS - 1 }
    expect(isSessionStale(oldSession, now, STALE_TTL_MS)).toBe(true)
  })

  it('境界値: TTL ぴったりは false', () => {
    const sessionAtBoundary = { ...session, startedAt: now - STALE_TTL_MS }
    expect(isSessionStale(sessionAtBoundary, now, STALE_TTL_MS)).toBe(false)
  })
})

describe('mergeBooks', () => {
  it('新規書籍を追加する', () => {
    const existing: ScrapeBook[] = [baseBook]
    const newBooks: ScrapeBook[] = [{ ...baseBook, volumeNumber: 2 }]
    const seen = new Set<string>([keyOf(baseBook)])

    const { books, seenKeys } = mergeBooks(existing, newBooks, seen)
    expect(books).toHaveLength(2)
    expect(seenKeys.size).toBe(2)
  })

  it('重複は追加しない', () => {
    const existing: ScrapeBook[] = [baseBook]
    const newBooks: ScrapeBook[] = [{ ...baseBook }]
    const seen = new Set<string>([keyOf(baseBook)])

    const { books, seenKeys } = mergeBooks(existing, newBooks, seen)
    expect(books).toHaveLength(1)
    expect(seenKeys.size).toBe(1)
  })

  it('同じシリーズで巻が違うものは別書籍とみなす', () => {
    const v1 = { ...baseBook, volumeNumber: 1 }
    const v2 = { ...baseBook, volumeNumber: 2 }
    const { books } = mergeBooks([], [v1, v2], new Set())
    expect(books).toHaveLength(2)
  })

  function keyOf(b: ScrapeBook): string {
    return `${b.title}|${b.author}|${b.volumeNumber ?? 'null'}`
  }
})

describe('shouldStopForSafety', () => {
  it('books が MAX 未満かつ pageNumber も MAX 未満 → false', () => {
    expect(shouldStopForSafety(100, 10)).toBe(false)
  })

  it('books が MAX_BOOKS_PER_REQUEST 以上 → true', () => {
    expect(shouldStopForSafety(MAX_BOOKS_PER_REQUEST, 10)).toBe(true)
    expect(shouldStopForSafety(MAX_BOOKS_PER_REQUEST + 1, 10)).toBe(true)
  })

  it('pageNumber が MAX_PAGES 以上 → true', () => {
    expect(shouldStopForSafety(100, MAX_PAGES)).toBe(true)
    expect(shouldStopForSafety(100, MAX_PAGES + 1)).toBe(true)
  })
})

describe('createEmptySession', () => {
  it('空のセッションを生成する', () => {
    const url = 'https://www.amazon.co.jp/foo?pageNumber=1'
    const now = 1_700_000_000_000
    const session = createEmptySession(url, now)
    expect(session.startedAt).toBe(now)
    expect(session.lastPageScraped).toBe(0)
    expect(session.books).toEqual([])
    expect(session.seenKeys).toEqual([])
  })

  it('pageNumber クエリを除いた originalUrl を保持する', () => {
    const url = 'https://www.amazon.co.jp/foo?pageNumber=5&sort=date'
    const session = createEmptySession(url, 0)
    expect(session.originalUrl).not.toContain('pageNumber=')
    expect(session.originalUrl).toContain('sort=date')
  })
})
