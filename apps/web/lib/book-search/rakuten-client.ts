import type { BookSearchClientResult, BookSearchParams, RakutenBooksResponse } from './types'
import { extractVolumeNumber } from './volume-parser'

const RAKUTEN_BOOKS_API_URL = 'https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404'

const TIMEOUT_MS = 5000
const MAX_RESPONSE_BYTES = 1_000_000

/**
 * 楽天ブックスAPIで書籍を検索し、正規化された結果を返す。
 */
export async function searchRakutenBooks(
  params: BookSearchParams,
): Promise<BookSearchClientResult> {
  const appId = process.env.RAKUTEN_APP_ID
  if (!appId) {
    throw new Error('RAKUTEN_APP_ID is not configured')
  }

  const url = new URL(RAKUTEN_BOOKS_API_URL)
  url.searchParams.set('applicationId', appId)
  url.searchParams.set('format', 'json')
  url.searchParams.set('title', params.query)
  url.searchParams.set('hits', String(params.limit ?? 10))
  url.searchParams.set('page', String(params.page ?? 1))

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(url.toString(), { signal: controller.signal })

    if (!response.ok) {
      throw new Error(`Rakuten Books API error: HTTP ${response.status}`)
    }

    const text = await response.text()
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error('Rakuten Books API response too large')
    }

    const data = JSON.parse(text) as RakutenBooksResponse

    return {
      totalCount: data.count,
      items: data.Items.map(({ Item }) => ({
        title: Item.title,
        author: Item.author,
        isbn: Item.isbn || undefined,
        volumeNumber: extractVolumeNumber(Item.title),
        thumbnailUrl: Item.largeImageUrl || undefined,
        publishedAt: parseSalesDate(Item.salesDate),
      })),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * 楽天の salesDate を正規化する。
 *
 * 対応フォーマット:
 *  - "2024年03月04日" / "2024年3月4日" → "2024-03-04"
 *  - "2024年03月04日頃" → "2024-03-04"
 *  - "2024年03月" / "2024年3月上旬" → "2024-03"
 *  - "2024年" → "2024"
 */
function parseSalesDate(salesDate: string): string | undefined {
  if (!salesDate) return undefined

  // YYYY年M月D日（1〜2桁の月日、末尾の "頃" 等は無視）
  const fullMatch = salesDate.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (fullMatch) {
    const month = fullMatch[2].padStart(2, '0')
    const day = fullMatch[3].padStart(2, '0')
    return `${fullMatch[1]}-${month}-${day}`
  }

  // YYYY年M月（日なし、"上旬"/"中旬"/"下旬"/"以降" 等は無視）
  const yearMonthMatch = salesDate.match(/(\d{4})年(\d{1,2})月/)
  if (yearMonthMatch) {
    const month = yearMonthMatch[2].padStart(2, '0')
    return `${yearMonthMatch[1]}-${month}`
  }

  // YYYY年
  const yearMatch = salesDate.match(/(\d{4})年/)
  if (yearMatch) {
    return yearMatch[1]
  }

  return undefined
}
