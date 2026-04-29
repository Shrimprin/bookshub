import type { SupabaseClient } from '@supabase/supabase-js'
import { getSeriesDetail } from '../get-series-detail'

// --- Mock helpers ---

function createMockSupabase(result: {
  data: Record<string, unknown>[] | null
  error: { message: string } | null
}) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
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
const seriesId = '11111111-1111-1111-1111-111111111111'

const mockRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'ub-1',
  store: 'kindle',
  created_at: '2026-04-19T08:19:21Z',
  books: {
    id: 'book-1',
    series_id: seriesId,
    volume_number: 1,
    thumbnail_url: 'https://example.com/op-1.jpg',
    isbn: '9784088xxx',
    published_at: '2024-01-01',
    is_adult: false,
    store_product_id: 'B0ABC1',
    created_at: '2024-01-01T00:00:00Z',
    series: {
      id: seriesId,
      title: 'ワンピース',
      author: '尾田栄一郎',
    },
    ...overrides,
  },
})

// --- Tests ---

describe('getSeriesDetail', () => {
  it('正常系: series メタと volumes を返す', async () => {
    const supabase = createMockSupabase({
      data: [
        mockRow(),
        { ...mockRow(), id: 'ub-2', books: { ...mockRow().books, id: 'book-2', volume_number: 2 } },
      ],
      error: null,
    })

    const result = await getSeriesDetail(supabase, userId, seriesId)

    expect(result).not.toBeNull()
    expect(result!.series).toEqual({
      id: seriesId,
      title: 'ワンピース',
      author: '尾田栄一郎',
    })
    expect(result!.volumes).toHaveLength(2)
    expect(result!.volumes[0]).toMatchObject({
      id: 'book-1',
      title: 'ワンピース',
      author: '尾田栄一郎',
      volumeNumber: 1,
      storeProductId: 'B0ABC1',
      userBookId: 'ub-1',
      store: 'kindle',
    })
  })

  it('user_id と books.series_id で eq フィルタを掛ける (IDOR 防御)', async () => {
    const supabase = createMockSupabase({ data: [mockRow()], error: null })

    await getSeriesDetail(supabase, userId, seriesId)

    expect(supabase.from).toHaveBeenCalledWith('user_books')
    expect(supabase._builder.eq).toHaveBeenCalledWith('user_id', userId)
    expect(supabase._builder.eq).toHaveBeenCalledWith('books.series_id', seriesId)
  })

  it('volumes は volume_number 昇順で返る (NULLS LAST、JS 側ソート)', async () => {
    // PostgREST の order(referencedTable) は embedded sort で親行に効かないため、
    // DB から順序保証なしで返ってきても JS 側で確実に並べる。
    const v3 = mockRow()
    v3.books.id = 'book-3'
    v3.books.volume_number = 3
    const v1 = {
      ...mockRow(),
      id: 'ub-1',
      books: { ...mockRow().books, id: 'book-1', volume_number: 1 },
    }
    const vNull = {
      ...mockRow(),
      id: 'ub-null',
      books: { ...mockRow().books, id: 'book-null', volume_number: null },
    }
    const v2 = {
      ...mockRow(),
      id: 'ub-2',
      books: { ...mockRow().books, id: 'book-2', volume_number: 2 },
    }

    // DB からは降順や混在で返ったとする
    const supabase = createMockSupabase({ data: [v3, vNull, v1, v2], error: null })

    const result = await getSeriesDetail(supabase, userId, seriesId)

    expect(result!.volumes.map((v) => v.volumeNumber)).toEqual([1, 2, 3, null])
  })

  it('同 volume_number は created_at で安定ソートされる', async () => {
    const a = {
      ...mockRow(),
      id: 'ub-a',
      books: {
        ...mockRow().books,
        id: 'book-a',
        volume_number: 1,
        created_at: '2024-01-02T00:00:00Z',
      },
    }
    const b = {
      ...mockRow(),
      id: 'ub-b',
      books: {
        ...mockRow().books,
        id: 'book-b',
        volume_number: 1,
        created_at: '2024-01-01T00:00:00Z',
      },
    }
    const supabase = createMockSupabase({ data: [a, b], error: null })

    const result = await getSeriesDetail(supabase, userId, seriesId)

    expect(result!.volumes.map((v) => v.userBookId)).toEqual(['ub-b', 'ub-a'])
  })

  it('0 件の場合は null を返す (存在しない / 他ユーザーの series)', async () => {
    const supabase = createMockSupabase({ data: [], error: null })

    const result = await getSeriesDetail(supabase, userId, seriesId)

    expect(result).toBeNull()
  })

  it('store_product_id が NULL の行は storeProductId: null', async () => {
    const row = mockRow()
    row.books.store_product_id = null
    const supabase = createMockSupabase({ data: [row], error: null })

    const result = await getSeriesDetail(supabase, userId, seriesId)

    expect(result!.volumes[0]?.storeProductId).toBeNull()
  })

  it('DB エラー時に throw する', async () => {
    const supabase = createMockSupabase({
      data: null,
      error: { message: 'permission denied' },
    })

    await expect(getSeriesDetail(supabase, userId, seriesId)).rejects.toThrow(
      /getSeriesDetail SELECT failed/,
    )
  })
})
