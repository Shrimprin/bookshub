import type { SupabaseClient } from '@supabase/supabase-js'
import { registerBook } from '../register-book'
import type { RegisterBook } from '@bookhub/shared'

vi.mock('@/lib/books/book-repository', () => ({
  normalizeText: vi.fn((text: string) => text.trim().normalize('NFC')),
  findExistingBook: vi.fn(),
  insertBook: vi.fn(),
}))

import { findExistingBook, insertBook } from '@/lib/books/book-repository'

// --- Mock helpers ---

function createThenableBuilder(result: Record<string, unknown>) {
  const builder: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockReturnValue(Promise.resolve(result)),
  }
  Object.defineProperty(builder, 'then', {
    value: (resolve: (v: unknown) => void) => {
      resolve(result)
      return Promise.resolve(result)
    },
    configurable: true,
  })
  return builder
}

function createMockSupabase(handlers: {
  user_books_select?: {
    data: Record<string, unknown>[] | null
    error: { message: string; code?: string } | null
  }
  user_books_insert?: {
    data: Record<string, unknown>[] | null
    error: { message: string; code?: string } | null
  }
}) {
  const selectResult = handlers.user_books_select ?? { data: [], error: null }
  const insertResult = handlers.user_books_insert ?? {
    data: [{ id: 'ub-1', store: 'kindle', created_at: '2024-01-01T00:00:00Z' }],
    error: null,
  }

  return {
    from: vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue(createThenableBuilder(selectResult)),
      insert: vi.fn().mockReturnValue(createThenableBuilder(insertResult)),
    })),
  } as unknown as SupabaseClient
}

const userId = 'user-uuid-123'

const validInput: RegisterBook = {
  title: 'ワンピース',
  author: '尾田栄一郎',
  volumeNumber: 107,
  store: 'kindle',
  isAdult: false,
}

const mockBookRow = {
  id: 'book-1',
  title: 'ワンピース',
  author: '尾田栄一郎',
  volume_number: 107,
}

// --- Tests ---

describe('registerBook', () => {
  beforeEach(() => {
    vi.mocked(findExistingBook).mockResolvedValue(null)
    vi.mocked(insertBook).mockResolvedValue(mockBookRow)
  })

  it('新規書籍を登録し、alreadyOwned: false を返す', async () => {
    const supabase = createMockSupabase({
      user_books_select: { data: [], error: null },
    })

    const result = await registerBook(supabase, userId, validInput)

    expect(result.alreadyOwned).toBe(false)
    expect(result.existingStores).toEqual([])
    expect(insertBook).toHaveBeenCalled()
  })

  it('既存書籍がある場合は findExistingBook の結果を使う', async () => {
    vi.mocked(findExistingBook).mockResolvedValue(mockBookRow)

    const supabase = createMockSupabase({
      user_books_select: { data: [], error: null },
    })

    const result = await registerBook(supabase, userId, validInput)

    expect(result.alreadyOwned).toBe(false)
    expect(insertBook).not.toHaveBeenCalled()
  })

  it('別ストアで所持済みの場合、alreadyOwned: true + existingStores を返す', async () => {
    vi.mocked(findExistingBook).mockResolvedValue(mockBookRow)

    const supabase = createMockSupabase({
      user_books_select: { data: [{ store: 'dmm' }], error: null },
    })

    const result = await registerBook(supabase, userId, validInput)

    expect(result.alreadyOwned).toBe(true)
    expect(result.existingStores).toEqual(['dmm'])
  })

  it('同一ストアで既に所持している場合、conflict エラーを返す', async () => {
    vi.mocked(findExistingBook).mockResolvedValue(mockBookRow)

    const supabase = createMockSupabase({
      user_books_insert: {
        data: null,
        error: { message: 'unique violation', code: '23505' },
      },
      user_books_select: { data: [], error: null },
    })

    const result = await registerBook(supabase, userId, validInput)

    expect(result).toHaveProperty('error', 'conflict')
  })

  it('user_books INSERT エラー（競合以外）時に throw する', async () => {
    const supabase = createMockSupabase({
      user_books_insert: {
        data: null,
        error: { message: 'DB error' },
      },
      user_books_select: { data: [], error: null },
    })

    await expect(registerBook(supabase, userId, validInput)).rejects.toThrow()
  })
})
