import { NextResponse } from 'next/server'
import { scrapePayloadSchema } from '@bookhub/shared'
import { createClientFromToken } from '@/lib/supabase/auth-helper'
import { processScrapePayload } from '@/lib/scrape/process-scrape'

export const runtime = 'edge'

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
  })
}

export async function POST(request: Request) {
  try {
    // 1. Bearer トークン認証
    const authHeader = request.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

    if (!token) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Missing Bearer token' },
        { status: 401 },
      )
    }

    const authResult = await createClientFromToken(token)
    if (!authResult) {
      return NextResponse.json(
        { error: 'unauthorized', message: 'Invalid or expired token' },
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
    const parsed = scrapePayloadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: 'validation_error',
          message: 'Request body validation failed',
          details: parsed.error.issues,
        },
        { status: 400 },
      )
    }

    // 4. ビジネスロジック実行
    const result = await processScrapePayload(supabase, user.id, parsed.data.books)

    return NextResponse.json(result, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'internal_error', message: 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}
