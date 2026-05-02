import { NextResponse } from 'next/server'
import { registerBookSchema, getBooksQuerySchema } from '@bookhub/shared'
import { createClientFromToken } from '@/lib/supabase/auth-helper'
import { getUserBooks } from '@/lib/books/get-user-books'
import { registerBook } from '@/lib/books/register-book'

async function authenticate(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) return null
  return createClientFromToken(token)
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

    const { supabase, user } = authResult

    // 2. クエリパラメータのバリデーション
    const url = new URL(request.url)
    const rawQuery: Record<string, string> = {}
    url.searchParams.forEach((value, key) => {
      rawQuery[key] = value
    })

    const parsed = getBooksQuerySchema.safeParse(rawQuery)
    if (!parsed.success) {
      // Zod issues の `received` 値はユーザー入力 (PII 含む可能性) のため log には path のみ残す
      const paths = parsed.error.issues.map((i) => i.path.join('.'))
      console.error('[GET /api/books] Validation failed at paths:', paths)
      return NextResponse.json(
        { error: 'validation_error', message: 'Invalid query parameters' },
        { status: 400 },
      )
    }

    // 3. ビジネスロジック実行
    const result = await getUserBooks(supabase, user.id, parsed.data)

    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    console.error('[GET /api/books] Unexpected error:', err)
    return NextResponse.json(
      { error: 'internal_error', message: 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    // 1. Bearer トークン認証
    const authResult = await authenticate(request)
    if (!authResult) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Missing or invalid Bearer token' },
        { status: 401 },
      )
    }

    const { supabase, user } = authResult

    // 2. リクエストボディのパース
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'invalid_json', message: 'Request body is not valid JSON' },
        { status: 400 },
      )
    }

    // 3. Zod バリデーション
    const parsed = registerBookSchema.safeParse(body)
    if (!parsed.success) {
      const paths = parsed.error.issues.map((i) => i.path.join('.'))
      console.error('[POST /api/books] Validation failed at paths:', paths)
      return NextResponse.json(
        { error: 'validation_error', message: 'Request body validation failed' },
        { status: 400 },
      )
    }

    // 4. ビジネスロジック実行
    const result = await registerBook(supabase, user.id, parsed.data)

    if ('error' in result) {
      return NextResponse.json(result, { status: 409 })
    }

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    console.error('[POST /api/books] Unexpected error:', err)
    return NextResponse.json(
      { error: 'internal_error', message: 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}
