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

  it('volume_number 昇順 (NULLS LAST) で order する', async () => {
    const supabase = createMockSupabase({ data: [mockRow()], error: null })

    await getSeriesDetail(supabase, userId, seriesId)

    expect(supabase._builder.order).toHaveBeenCalledWith('volume_number', {
      referencedTable: 'books',
      nullsFirst: false,
    })
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
