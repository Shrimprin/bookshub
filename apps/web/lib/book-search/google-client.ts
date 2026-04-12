import type {
  BookSearchClientResult,
  BookSearchParams,
  GoogleBooksResponse,
  GoogleBooksVolumeInfo,
} from './types'
import { extractVolumeNumber } from './volume-parser'

const GOOGLE_BOOKS_API_URL = 'https://www.googleapis.com/books/v1/volumes'

const TIMEOUT_MS = 5000
const MAX_RESPONSE_BYTES = 1_000_000

/**
 * Google Books APIで書籍を検索し、正規化された結果を返す。
 */
export async function searchGoogleBooks(params: BookSearchParams): Promise<BookSearchClientResult> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY
  if (!apiKey) {
    throw new Error('GOOGLE_BOOKS_API_KEY is not configured')
  }

  const limit = params.limit ?? 10
  const page = params.page ?? 1
  const startIndex = (page - 1) * limit

  const url = new URL(GOOGLE_BOOKS_API_URL)
  url.searchParams.set('q', params.query)
  url.searchParams.set('key', apiKey)
  url.searchParams.set('maxResults', String(limit))
  url.searchParams.set('startIndex', String(startIndex))
  url.searchParams.set('langRestrict', 'ja')

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const response = await fetch(url.toString(), { signal: controller.signal })

    if (!response.ok) {
      throw new Error(`Google Books API error: HTTP ${response.status}`)
    }

    const text = await response.text()
    if (text.length > MAX_RESPONSE_BYTES) {
      throw new Error('Google Books API response too large')
    }

    const data = JSON.parse(text) as GoogleBooksResponse

    return {
      totalCount: data.totalItems,
      items: (data.items ?? []).map(({ volumeInfo }) => ({
        title: volumeInfo.title,
        author: joinAuthors(volumeInfo.authors),
        isbn: extractIsbn13(volumeInfo),
        volumeNumber: extractVolumeNumber(volumeInfo.title),
        thumbnailUrl: normalizeImageUrl(volumeInfo.imageLinks?.thumbnail),
        publishedAt: volumeInfo.publishedDate || undefined,
      })),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

function joinAuthors(authors: string[] | undefined): string {
  return authors?.join(', ') ?? ''
}

/**
 * ISBN-13 を ISBN-10 より優先して取得する。
 */
function extractIsbn13(volumeInfo: GoogleBooksVolumeInfo): string | undefined {
  const identifiers = volumeInfo.industryIdentifiers
  if (!identifiers) return undefined

  const isbn13 = identifiers.find((id) => id.type === 'ISBN_13')
  if (isbn13) return isbn13.identifier

  const isbn10 = identifiers.find((id) => id.type === 'ISBN_10')
  return isbn10?.identifier
}

/**
 * Google Books の画像URLを http -> https に変換する。
 */
function normalizeImageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined
  return url.replace(/^http:\/\//, 'https://')
}
