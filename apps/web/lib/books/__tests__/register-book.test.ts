import type { SupabaseClient } from '@supabase/supabase-js'
import { registerBook } from '../register-book'
import type { RegisterBook } from '@bookhub/shared'

vi.mock('@/lib/books/book-repository', () => ({
  normalizeText: vi.fn((text: string) => text.trim().normalize('NFC')),
  findExistingBook: vi.fn(),
  insertBook: vi.fn(),
}))

vi.mock('@/lib/next-volume/refresh-series-next-volume', () => ({
  refreshSeriesNextVolume: vi.fn(),
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: vi.fn(() => ({ __mock: 'service-role-client' })),
}))

import { findExistingBook, insertBook } from '@/lib/books/book-repository'
import { refreshSeriesNextVolume } from '@/lib/next-volume/refresh-series-next-volume'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

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
  series_id: 'series-1',
  volume_number: 107,
  thumbnail_url: null,
  isbn: null,
  published_at: null,
  is_adult: false,
  store_product_id: 'B0ABCDEFGH',
  created_at: '2024-01-01T00:00:00Z',
  series: {
    title: 'ワンピース',
    author: '尾田栄一郎',
  },
}

// --- Tests ---

describe('registerBook', () => {
  beforeEach(() => {
    vi.mocked(findExistingBook).mockReset()
    vi.mocked(insertBook).mockReset()
    vi.mocked(refreshSeriesNextVolume).mockReset()
    vi.mocked(createServiceRoleClient).mockReset()
    // 既定: 既存 book なし、series も新規 (両方を返すよう default 設定)
    vi.mocked(findExistingBook).mockResolvedValue({ book: null, seriesExisted: false })
    vi.mocked(insertBook).mockResolvedValue(mockBookRow)
    vi.mocked(refreshSeriesNextVolume).mockResolvedValue(undefined)
    vi.mocked(createServiceRoleClient).mockReturnValue({
      __mock: 'service-role-client',
    } as never)
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

  it('book レスポンスに storeProductId がマッピングされる', async () => {
    const supabase = createMockSupabase({
      user_books_select: { data: [], error: null },
    })

    const result = await registerBook(supabase, userId, validInput)

    if (!('book' in result)) throw new Error('expected success branch with `book`')
    expect(result.book.storeProductId).toBe('B0ABCDEFGH')
  })

  it('store_product_id が NULL の行は storeProductId: null にマッピングされる', async () => {
    vi.mocked(insertBook).mockResolvedValue({ ...mockBookRow, store_product_id: null })

    const supabase = createMockSupabase({
      user_books_select: { data: [], error: null },
    })

    const result = await registerBook(supabase, userId, validInput)

    if (!('book' in result)) throw new Error('expected success branch with `book`')
    expect(result.book.storeProductId).toBeNull()
  })

  it('既存書籍がある場合は findExistingBook の結果を使う', async () => {
    vi.mocked(findExistingBook).mockResolvedValue({ book: mockBookRow, seriesExisted: true })

    const supabase = createMockSupabase({
      user_books_select: { data: [], error: null },
    })

    const result = await registerBook(supabase, userId, validInput)

    expect(result.alreadyOwned).toBe(false)
    expect(insertBook).not.toHaveBeenCalled()
  })

  it('別ストアで所持済みの場合、alreadyOwned: true + existingStores を返す', async () => {
    vi.mocked(findExistingBook).mockResolvedValue({ book: mockBookRow, seriesExisted: true })

    const supabase = createMockSupabase({
      user_books_select: { data: [{ store: 'dmm' }], error: null },
    })

    const result = await registerBook(supabase, userId, validInput)

    expect(result.alreadyOwned).toBe(true)
    expect(result.existingStores).toEqual(['dmm'])
  })

  it('同一ストアで既に所持している場合、conflict エラーを返す', async () => {
    vi.mocked(findExistingBook).mockResolvedValue({ book: mockBookRow, seriesExisted: true })

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

  describe('次巻 sync lookup', () => {
    it('シリーズが新規作成された場合、refreshSeriesNextVolume を呼ぶ', async () => {
      // findExistingBook が seriesExisted: false を返す = 新規シリーズ
      vi.mocked(findExistingBook).mockResolvedValue({ book: null, seriesExisted: false })

      const supabase = createMockSupabase({
        user_books_select: { data: [], error: null },
      })

      await registerBook(supabase, userId, validInput)

      expect(createServiceRoleClient).toHaveBeenCalledTimes(1)
      expect(refreshSeriesNextVolume).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          seriesId: 'series-1',
          seriesTitle: 'ワンピース',
          author: '尾田栄一郎',
          currentMaxVolume: 107,
          timeoutMs: 2000,
        }),
      )
    })

    it('既存シリーズなら refreshSeriesNextVolume を呼ばない', async () => {
      vi.mocked(findExistingBook).mockResolvedValue({
        book: mockBookRow,
        seriesExisted: true,
      })

      const supabase = createMockSupabase({
        user_books_select: { data: [], error: null },
      })

      await registerBook(supabase, userId, validInput)

      expect(refreshSeriesNextVolume).not.toHaveBeenCalled()
    })

    it('volumeNumber が無い (単巻作品) なら refreshSeriesNextVolume を呼ばない', async () => {
      vi.mocked(findExistingBook).mockResolvedValue({ book: null, seriesExisted: false })
      vi.mocked(insertBook).mockResolvedValue({ ...mockBookRow, volume_number: null })

      const supabase = createMockSupabase({
        user_books_select: { data: [], error: null },
      })

      await registerBook(supabase, userId, { ...validInput, volumeNumber: undefined })

      expect(refreshSeriesNextVolume).not.toHaveBeenCalled()
    })

    it('refreshSeriesNextVolume が throw しても registerBook 全体は成功する', async () => {
      vi.mocked(findExistingBook).mockResolvedValue({ book: null, seriesExisted: false })
      vi.mocked(refreshSeriesNextVolume).mockRejectedValue(new Error('Rakuten down'))

      const supabase = createMockSupabase({
        user_books_select: { data: [], error: null },
      })

      const result = await registerBook(supabase, userId, validInput)

      // sync lookup は best-effort: 失敗しても本体の登録結果はそのまま返す
      expect('book' in result).toBe(true)
    })
  })
})
