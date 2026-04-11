import type { SupabaseClient } from '@supabase/supabase-js'
import { updateUserBook } from '../update-user-book'

// --- Mock helpers ---

function createMockSupabase(handlers: {
  select_result?: {
    data: Record<string, unknown>[] | null
    error: { message: string } | null
  }
  update_result?: {
    data: Record<string, unknown>[] | null
    error: { message: string; code?: string } | null
  }
}) {
  const selectBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(
      Promise.resolve(
        handlers.select_result ?? {
          data: null,
          error: { message: 'not found', code: 'PGRST116' },
        },
      ),
    ),
  }

  const updateBuilder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockReturnValue(Promise.resolve(handlers.update_result ?? { data: null, error: null })),
  }

  return {
    from: vi.fn().mockImplementation(() => {
      // First call is SELECT (checking existence), second is UPDATE
      const callCount = { value: 0 }
      const handler = {
        select: vi.fn().mockImplementation(() => {
          callCount.value++
          if (callCount.value === 1) return selectBuilder
          return updateBuilder
        }),
        update: vi.fn().mockReturnValue(updateBuilder),
      }
      return handler
    }),
  } as unknown as SupabaseClient
}

const userId = 'user-uuid-123'
const userBookId = '550e8400-e29b-41d4-a716-446655440000'

const existingRecord = {
  id: userBookId,
  user_id: userId,
  book_id: 'book-1',
  store: 'kindle',
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
    created_at: '2024-01-01T00:00:00Z',
  },
}

// --- Tests ---

describe('updateUserBook', () => {
  it('正常に store を更新して結果を返す', async () => {
    const updatedRecord = { ...existingRecord, store: 'dmm' }
    const supabase = createMockSupabase({
      select_result: { data: existingRecord, error: null },
      update_result: { data: updatedRecord, error: null },
    })

    const result = await updateUserBook(supabase, userId, userBookId, { store: 'dmm' })

    expect(result).toHaveProperty('store', 'dmm')
  })

  it('存在しないレコードの場合 not_found エラーを返す', async () => {
    const supabase = createMockSupabase({
      select_result: { data: null, error: { message: 'not found' } },
    })

    const result = await updateUserBook(supabase, userId, userBookId, { store: 'dmm' })

    expect(result).toHaveProperty('error', 'not_found')
  })
})
