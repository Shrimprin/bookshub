import type { SupabaseClient } from '@supabase/supabase-js'
import { deleteUserBook } from '../delete-user-book'

// --- Mock helpers ---

function createMockSupabase(result: { error: { message: string } | null; count: number | null }) {
  const builder: Record<string, unknown> = {
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
  }
  Object.defineProperty(builder, 'then', {
    value: (resolve: (v: unknown) => void) => {
      resolve(result)
      return Promise.resolve(result)
    },
    configurable: true,
  })

  return {
    from: vi.fn().mockReturnValue(builder),
  } as unknown as SupabaseClient
}

const userId = 'user-uuid-123'
const userBookId = '550e8400-e29b-41d4-a716-446655440000'

// --- Tests ---

describe('deleteUserBook', () => {
  it('正常に削除して成功メッセージを返す', async () => {
    const supabase = createMockSupabase({ error: null, count: 1 })

    const result = await deleteUserBook(supabase, userId, userBookId)

    expect(result).toEqual({ message: 'Deleted' })
  })

  it('存在しないレコードの場合 not_found エラーを返す（count: 0）', async () => {
    const supabase = createMockSupabase({ error: null, count: 0 })

    const result = await deleteUserBook(supabase, userId, userBookId)

    expect(result).toHaveProperty('error', 'not_found')
  })

  it('DELETE エラー時に throw する', async () => {
    const supabase = createMockSupabase({ error: { message: 'DB error' }, count: null })

    await expect(deleteUserBook(supabase, userId, userBookId)).rejects.toThrow(
      'user_books DELETE failed',
    )
  })
})
