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

    const contentLength = response.headers.get('content-length')
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
      throw new Error('Rakuten Books API response too large')
    }

    const data = (await response.json()) as RakutenBooksResponse

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
 * 楽天の salesDate（例: "2024年03月04日"）を "YYYY-MM-DD" 形式に変換する。
 */
function parseSalesDate(salesDate: string): string | undefined {
  const match = salesDate.match(/(\d{4})年(\d{2})月(\d{2})日/)
  if (!match) return undefined
  return `${match[1]}-${match[2]}-${match[3]}`
}
