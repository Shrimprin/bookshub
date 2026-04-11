import { NextResponse } from 'next/server'
import { userBookIdSchema, updateUserBookSchema } from '@bookhub/shared'
import { createClientFromToken } from '@/lib/supabase/auth-helper'
import { updateUserBook } from '@/lib/books/update-user-book'
import { deleteUserBook } from '@/lib/books/delete-user-book'

export const runtime = 'edge'

async function authenticate(request: Request) {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) return null
  return createClientFromToken(token)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // 2. パスパラメータのバリデーション
    const { id } = await params
    const idParsed = userBookIdSchema.safeParse(id)
    if (!idParsed.success) {
      return NextResponse.json(
        { error: 'invalid_uuid', message: 'Invalid user book ID format' },
        { status: 400 },
      )
    }

    // 3. リクエストボディのパース
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'invalid_json', message: 'Request body is not valid JSON' },
        { status: 400 },
      )
    }

    // 4. Zod バリデーション
    const parsed = updateUserBookSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation_error', message: 'Request body validation failed' },
        { status: 400 },
      )
    }

    // 5. ビジネスロジック実行
    const result = await updateUserBook(supabase, user.id, idParsed.data, parsed.data)

    if ('error' in result) {
      return NextResponse.json(result, { status: 404 })
    }

    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    console.error('[PATCH /api/books/[id]] Unexpected error:', err)
    return NextResponse.json(
      { error: 'internal_error', message: 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

    // 2. パスパラメータのバリデーション
    const { id } = await params
    const idParsed = userBookIdSchema.safeParse(id)
    if (!idParsed.success) {
      return NextResponse.json(
        { error: 'invalid_uuid', message: 'Invalid user book ID format' },
        { status: 400 },
      )
    }

    // 3. ビジネスロジック実行
    const result = await deleteUserBook(supabase, user.id, idParsed.data)

    if ('error' in result) {
      return NextResponse.json(result, { status: 404 })
    }

    return NextResponse.json(result, { status: 200 })
  } catch (err) {
    console.error('[DELETE /api/books/[id]] Unexpected error:', err)
    return NextResponse.json(
      { error: 'internal_error', message: 'An unexpected error occurred' },
      { status: 500 },
    )
  }
}
