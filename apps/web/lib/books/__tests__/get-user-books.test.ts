import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserBooks } from '../get-user-books'
import type { GetBooksQuery } from '@bookhub/shared'

// --- Mock helpers ---

function createMockSupabase(result: {
  data: Record<string, unknown>[] | null
  count: number | null
  error: { message: string } | null
}) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  }
  Object.defineProperty(builder, 'then', {
    value: (resolve: (v: unknown) => void) => {
      resolve(result)
      return Promise.resolve(result)
    },
  })
  return {
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
  } as unknown as SupabaseClient & { _builder: typeof builder }
}

const userId = 'user-uuid-123'

const defaultQuery: GetBooksQuery = {
  page: 1,
  limit: 20,
}

const mockBookRow = {
  id: 'ub-1',
  store: 'kindle',
  created_at: '2024-03-04T00:00:00Z',
  books: {
    id: 'book-1',
    title: 'ワンピース',
    author: '尾田栄一郎',
    volume_number: 107,
    thumbnail_url: 'https://example.com/cover.jpg',
    isbn: '9784088835099',
    published_at: '2024-03-04',
    is_adult: false,
    created_at: '2024-01-01T00:00:00Z',
  },
}

// --- Tests ---

describe('getUserBooks', () => {
  it('正常にデータを取得して camelCase に変換する', async () => {
    const supabase = createMockSupabase({
      data: [mockBookRow],
      count: 1,
      error: null,
    })

    const result = await getUserBooks(supabase, userId, defaultQuery)

    expect(result.books).toHaveLength(1)
    expect(result.books[0]).toEqual({
      id: 'book-1',
      title: 'ワンピース',
      author: '尾田栄一郎',
      volumeNumber: 107,
      thumbnailUrl: 'https://example.com/cover.jpg',
      isbn: '9784088835099',
      publishedAt: '2024-03-04',
      isAdult: false,
      createdAt: '2024-01-01T00:00:00Z',
      userBookId: 'ub-1',
      store: 'kindle',
      userBookCreatedAt: '2024-03-04T00:00:00Z',
    })
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
  })

  it('結果が空の場合、空配列を返す', async () => {
    const supabase = createMockSupabase({ data: [], count: 0, error: null })

    const result = await getUserBooks(supabase, userId, defaultQuery)

    expect(result.books).toEqual([])
    expect(result.total).toBe(0)
  })

  it('q パラメータがある場合、or フィルタを呼ぶ', async () => {
    const supabase = createMockSupabase({ data: [], count: 0, error: null })

    await getUserBooks(supabase, userId, { ...defaultQuery, q: 'ワンピ' })

    expect(supabase._builder.or).toHaveBeenCalled()
  })

  it('store フィルタがある場合、eq を呼ぶ', async () => {
    const supabase = createMockSupabase({ data: [], count: 0, error: null })

    await getUserBooks(supabase, userId, { ...defaultQuery, store: 'kindle' })

    // eq は user_id 用と store 用で複数回呼ばれる
    expect(supabase._builder.eq).toHaveBeenCalledTimes(2)
  })

  it('ページネーションの range を正しく計算する', async () => {
    const supabase = createMockSupabase({ data: [], count: 0, error: null })

    await getUserBooks(supabase, userId, { page: 3, limit: 10 })

    expect(supabase._builder.range).toHaveBeenCalledWith(20, 29)
  })

  it('DB エラー時に throw する', async () => {
    const supabase = createMockSupabase({
      data: null,
      count: null,
      error: { message: 'DB error' },
    })

    await expect(getUserBooks(supabase, userId, defaultQuery)).rejects.toThrow()
  })
})
