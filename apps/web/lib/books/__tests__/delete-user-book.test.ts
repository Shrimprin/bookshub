import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteUserBook } from '../delete-user-book'

// --- Mock helpers ---

function createMockSupabase(handlers: {
  select_result?: {
    data: Record<string, unknown> | null
    error: { message: string } | null
  }
  delete_result?: {
    error: { message: string } | null
  }
}) {
  const selectBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockReturnValue(
        Promise.resolve(handlers.select_result ?? { data: null, error: { message: 'not found' } }),
      ),
  }

  const deleteBuilder = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  }
  Object.defineProperty(deleteBuilder, 'then', {
    value: (resolve: (v: unknown) => void) => {
      const result = handlers.delete_result ?? { error: null }
      resolve(result)
      return Promise.resolve(result)
    },
  })

  return {
    from: vi.fn().mockImplementation(() => {
      const callCount = { value: 0 }
      return {
        select: vi.fn().mockImplementation(() => {
          callCount.value++
          return selectBuilder
        }),
        delete: vi.fn().mockReturnValue(deleteBuilder),
      }
    }),
  } as unknown as SupabaseClient
}

const userId = 'user-uuid-123'
const userBookId = '550e8400-e29b-41d4-a716-446655440000'

// --- Tests ---

describe('deleteUserBook', () => {
  it('正常に削除して成功メッセージを返す', async () => {
    const supabase = createMockSupabase({
      select_result: { data: { id: userBookId }, error: null },
      delete_result: { error: null },
    })

    const result = await deleteUserBook(supabase, userId, userBookId)

    expect(result).toEqual({ message: 'Deleted' })
  })

  it('存在しないレコー��の場合 not_found エラーを返す', async () => {
    const supabase = createMockSupabase({
      select_result: { data: null, error: { message: 'not found' } },
    })

    const result = await deleteUserBook(supabase, userId, userBookId)

    expect(result).toHaveProperty('error', 'not_found')
  })

  it('DELETE エラー時に throw する', async () => {
    const supabase = createMockSupabase({
      select_result: { data: { id: userBookId }, error: null },
      delete_result: { error: { message: 'DB error' } },
    })

    await expect(deleteUserBook(supabase, userId, userBookId)).rejects.toThrow()
  })
})
