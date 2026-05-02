import { NextResponse } from 'next/server'
import { createClientFromToken } from '@/lib/supabase/auth-helper'
import { searchBooks } from '@/lib/book-search/book-search-service'

async function authenticate(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) return null
  return createClientFromToken(token)
}

function parseSearchQuery(searchParams: URLSearchParams) {
  const rawQ = searchParams.get('q')
  const q = rawQ?.trim()
  if (!q || q.length === 0 || q.length > 200) {
    return null
  }

  const rawPage = searchParams.get('page')
  const page = rawPage === null ? 1 : Number(rawPage)
  if (!Number.isInteger(page) || page < 1 || page > 1000) return null

  const rawLimit = searchParams.get('limit')
  const limit = rawLimit === null ? 10 : Number(rawLimit)
  if (!Number.isInteger(limit) || limit < 1 || limit > 30) return null

  return { q, page, limit }
}

export async function GET(request: Request) {
  try {
    // 1. Bearer トークン認証
    const authResult = await authenticate(request)
    if (!authResult) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Missing or invalid Bearer token' },
        { status: 401 },
      )
    }

    // 2. クエリパラメータのバリデーション
    const url = new URL(request.url)
    const parsed = parseSearchQuery(url.searchParams)
    if (!parsed) {
      return NextResponse.json(
        { error: 'validation_error', message: 'Invalid query parameters' },
        { status: 400 },
      )
    }

    // 3. 書籍検索実行
    const result = await searchBooks({
      query: parsed.q,
      page: parsed.page,
      limit: parsed.limit,
    })

    // APIキー未設定は内部設定の問題 → 503 で返す（設定情報を漏洩させない）
    if (
      result.source === 'none' &&
      'error' in result &&
      result.error === 'no_api_keys_configured'
    ) {
      return NextResponse.json(
        { error: 'service_unavailable', message: 'Book search is temporarily unavailable' },
        { status: 503 },
      )
    }

    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    console.error('[GET /api/books/search] Unexpected error:', err)
    return NextResponse.json(
      { error: 'internal_error', message: 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}
