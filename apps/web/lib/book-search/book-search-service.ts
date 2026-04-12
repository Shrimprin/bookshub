import type { BookSearchParams, BookSearchResult } from './types'
import { searchRakutenBooks } from './rakuten-client'
import { searchGoogleBooks } from './google-client'

/**
 * フォールバック付き統合書籍検索。
 *
 * 1. 楽天ブックスAPIで検索（RAKUTEN_APP_ID が設定されている場合）
 * 2. 失敗 or 0件 → Google Books APIにフォールバック（GOOGLE_BOOKS_API_KEY が設定されている場合）
 * 3. 両方失敗 → { source: 'none', error: '...' }
 */
export async function searchBooks(params: BookSearchParams): Promise<BookSearchResult> {
  const hasRakuten = !!process.env.RAKUTEN_APP_ID
  const hasGoogle = !!process.env.GOOGLE_BOOKS_API_KEY

  if (!hasRakuten && !hasGoogle) {
    return {
      items: [],
      totalCount: 0,
      source: 'none',
      error: 'no_api_keys_configured',
      hasMore: false,
    }
  }

  const limit = params.limit ?? 10
  const page = params.page ?? 1
  let anyApiResponded = false

  // 楽天で検索を試行
  if (hasRakuten) {
    try {
      const result = await searchRakutenBooks(params)
      anyApiResponded = true
      if (result.items.length > 0) {
        return {
          items: result.items,
          totalCount: result.totalCount,
          source: 'rakuten',
          hasMore: page * limit < result.totalCount,
        }
      }
      // 0件の場合はフォールバック
    } catch {
      // エラーの場合はフォールバック
    }
  }

  // Google にフォールバック
  if (hasGoogle) {
    try {
      const result = await searchGoogleBooks(params)
      anyApiResponded = true
      if (result.items.length > 0) {
        return {
          items: result.items,
          totalCount: result.totalCount,
          source: 'google',
          hasMore: page * limit < result.totalCount,
        }
      }
    } catch {
      // Google も失敗
    }
  }

  return {
    items: [],
    totalCount: 0,
    source: 'none',
    error: anyApiResponded ? 'no_results' : 'all_apis_failed',
    hasMore: false,
  }
}
