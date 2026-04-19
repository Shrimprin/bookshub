import type { SupabaseClient } from '@supabase/supabase-js'
import { updateUserBook } from '../update-user-book'

// --- Mock helpers ---

function createMockSupabase(result: {
  data: Record<string, unknown> | null
  error: { message: string; code?: string } | null
  count: number | null
}) {
  const builder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(Promise.resolve(result)),
  }

  return {
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
  } as unknown as SupabaseClient & { _builder: typeof builder }
}

const userId = 'user-uuid-123'
const userBookId = '550e8400-e29b-41d4-a716-446655440000'

const updatedRecord = {
  id: userBookId,
  store: 'dmm',
  created_at: '2024-01-01T00:00:00Z',
  books: {
    id: 'book-1',
    title: 'ワンピース',
    author: '尾田栄一郎',
    volume_number: 107,
    thumbnail_url: null,
    isbn: null,
    published_at: null,
    is_adult: false,
    store_product_id: 'B0ABCDEFGH',
    created_at: '2024-01-01T00:00:00Z',
  },
}

// --- Tests ---

describe('updateUserBook', () => {
  it('正常に store を更新して結果を返す', async () => {
    const supabase = createMockSupabase({
      data: updatedRecord,
      error: null,
      count: 1,
    })

    const result = await updateUserBook(supabase, userId, userBookId, { store: 'dmm' })

    expect(result).toHaveProperty('store', 'dmm')
    expect(result).toHaveProperty('title', 'ワンピース')
    expect(result).toHaveProperty('storeProductId', 'B0ABCDEFGH')
  })

  it('store_product_id が NULL の行は storeProductId: null にマッピングされる', async () => {
    const supabase = createMockSupabase({
      data: {
        ...updatedRecord,
        books: { ...updatedRecord.books, store_product_id: null },
      },
      error: null,
      count: 1,
    })

    const result = await updateUserBook(supabase, userId, userBookId, { store: 'dmm' })

    expect(result).toHaveProperty('storeProductId', null)
  })

  it('存在しないレコードの場合 not_found エラーを返す', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: 'not found', code: 'PGRST116' },
      count: 0,
    })

    const result = await updateUserBook(supabase, userId, userBookId, { store: 'dmm' })

    expect(result).toHaveProperty('error', 'not_found')
  })

  it('UPDATE が DB エラーで失敗した場合 throw する', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: 'DB error', code: '42501' },
      count: null,
    })

    await expect(updateUserBook(supabase, userId, userBookId, { store: 'dmm' })).rejects.toThrow(
      'user_books UPDATE failed',
    )
  })
})
