import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeText, findExistingBook, insertBook } from '../book-repository'

// --- Supabase mock helpers ---

type MockSingleResult = {
  data: Record<string, unknown> | null
  error: { message: string; code?: string } | null
}

type MockQueryResult = {
  data: Record<string, unknown>[] | null
  error: { message: string; code?: string } | null
}

type MockRpcResult = MockSingleResult

/**
 * findExistingBook は「series を maybeSingle → books を select」の 2-query。
 * insertBook は RPC 1 発。両方をカバーする mock を提供する。
 */
function createMockSupabase(options: {
  series?: { maybeSingle?: MockSingleResult }
  books?: { select?: MockQueryResult }
  rpc?: MockRpcResult
}) {
  const rpcMock = vi.fn().mockImplementation(() => {
    const result = options.rpc ?? { data: null, error: null }
    return {
      single: vi.fn().mockResolvedValue(result),
    }
  })

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'series') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue(options.series?.maybeSingle ?? { data: null, error: null }),
              }),
            }),
          }),
        }
      }
      if (table === 'books') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue(options.books?.select ?? { data: [], error: null }),
              eq: vi.fn().mockResolvedValue(options.books?.select ?? { data: [], error: null }),
            }),
          }),
        }
      }
      return {}
    }),
    rpc: rpcMock,
  } as unknown as SupabaseClient & { rpc: ReturnType<typeof vi.fn> }
}

// --- normalizeText ---

describe('normalizeText', () => {
  it('前後の空白を除去する', () => {
    expect(normalizeText('  テスト  ')).toBe('テスト')
  })

  it('NFC 正規化を行う', () => {
    const nfd = 'が'
    const nfc = nfd.normalize('NFC')
    expect(normalizeText(nfd)).toBe(nfc)
  })

  it('空文字をそのまま返す', () => {
    expect(normalizeText('')).toBe('')
  })
})

// --- findExistingBook ---

describe('findExistingBook', () => {
  const matchedBook = {
    id: 'book-1',
    series_id: 'series-1',
    volume_number: 107,
    thumbnail_url: null,
    isbn: null,
    published_at: null,
    is_adult: false,
    store_product_id: null,
    series: { title: 'ワンピース', author: '尾田栄一郎' },
  }

  it('series が見つかり、books にも一致行があれば book と seriesExisted: true を返す', async () => {
    const supabase = createMockSupabase({
      series: { maybeSingle: { data: { id: 'series-1' }, error: null } },
      books: { select: { data: [matchedBook], error: null } },
    })

    const result = await findExistingBook(supabase, 'ワンピース', '尾田栄一郎', 107)
    expect(result).toEqual({ book: matchedBook, seriesExisted: true })
  })

  it('series が存在しない場合は books をクエリせず book: null + seriesExisted: false を返す', async () => {
    const supabase = createMockSupabase({
      series: { maybeSingle: { data: null, error: null } },
    })

    const result = await findExistingBook(supabase, '存在しない作品', '架空作者', 1)
    expect(result).toEqual({ book: null, seriesExisted: false })
    // from('books') が呼ばれていないことを確認 (series 確認のみ)
    expect(supabase.from).toHaveBeenCalledWith('series')
    expect(supabase.from).not.toHaveBeenCalledWith('books')
  })

  it('series はあっても books に対応行が無ければ book: null + seriesExisted: true を返す', async () => {
    const supabase = createMockSupabase({
      series: { maybeSingle: { data: { id: 'series-1' }, error: null } },
      books: { select: { data: [], error: null } },
    })

    const result = await findExistingBook(supabase, 'ワンピース', '尾田栄一郎', 999)
    expect(result).toEqual({ book: null, seriesExisted: true })
  })

  it('volumeNumber が undefined の場合は IS NULL でクエリする', async () => {
    const supabase = createMockSupabase({
      series: { maybeSingle: { data: { id: 'series-1' }, error: null } },
      books: { select: { data: [], error: null } },
    })

    await findExistingBook(supabase, '火花', '又吉直樹', undefined)
    expect(supabase.from).toHaveBeenCalledWith('books')
  })

  it('series SELECT エラー時に throw する', async () => {
    const supabase = createMockSupabase({
      series: { maybeSingle: { data: null, error: { message: 'series DB error' } } },
    })

    await expect(findExistingBook(supabase, 'test', 'author', 1)).rejects.toThrow(
      'series SELECT failed',
    )
  })

  it('books SELECT エラー時に throw する', async () => {
    const supabase = createMockSupabase({
      series: { maybeSingle: { data: { id: 'series-1' }, error: null } },
      books: { select: { data: null, error: { message: 'books DB error' } } },
    })

    await expect(findExistingBook(supabase, 'test', 'author', 1)).rejects.toThrow(
      'books SELECT failed',
    )
  })
})

// --- insertBook (RPC upsert_book_with_series) ---

describe('insertBook', () => {
  // RPC の戻り値には title/author が無い (books テーブルから DROP 済み)
  const rpcBookRow = {
    id: 'new-id',
    series_id: 'series-1',
    volume_number: 107,
    thumbnail_url: null,
    isbn: null,
    published_at: null,
    is_adult: false,
    store_product_id: null,
  }

  it('upsert_book_with_series RPC を呼び出し、戻り値に series を合成する', async () => {
    const supabase = createMockSupabase({
      rpc: { data: rpcBookRow, error: null },
    })

    const result = await insertBook(supabase, {
      title: 'ワンピース',
      author: '尾田栄一郎',
      volumeNumber: 107,
      store: 'kindle',
      isAdult: false,
    })

    expect(result).toEqual({
      ...rpcBookRow,
      series: { title: 'ワンピース', author: '尾田栄一郎' },
    })
    expect((supabase as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith(
      'upsert_book_with_series',
      expect.objectContaining({
        p_title: 'ワンピース',
        p_author: '尾田栄一郎',
        p_volume_number: 107,
        p_is_adult: false,
      }),
    )
  })

  it('series と books を atomic に登録するため RPC が 1 回だけ呼ばれる', async () => {
    const supabase = createMockSupabase({
      rpc: { data: rpcBookRow, error: null },
    })

    await insertBook(supabase, {
      title: 'ワンピース',
      author: '尾田栄一郎',
      volumeNumber: 107,
      store: 'kindle',
      isAdult: false,
    })

    const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1)
  })

  it('title / author は NFC 正規化されて RPC と series に渡る', async () => {
    const supabase = createMockSupabase({
      rpc: { data: rpcBookRow, error: null },
    })

    const result = await insertBook(supabase, {
      title: '  ワンピース  ',
      author: '  尾田栄一郎  ',
      volumeNumber: 107,
      store: 'kindle',
      isAdult: false,
    })

    const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'upsert_book_with_series',
      expect.objectContaining({
        p_title: 'ワンピース',
        p_author: '尾田栄一郎',
      }),
    )
    expect(result.series).toEqual({ title: 'ワンピース', author: '尾田栄一郎' })
  })

  it('optional フィールド未指定時は NULL / false がパラメータに入る', async () => {
    const supabase = createMockSupabase({
      rpc: { data: rpcBookRow, error: null },
    })

    await insertBook(supabase, {
      title: '火花',
      author: '又吉直樹',
      store: 'kindle',
    })

    const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'upsert_book_with_series',
      expect.objectContaining({
        p_volume_number: null,
        p_thumbnail_url: null,
        p_isbn: null,
        p_published_at: null,
        p_is_adult: false,
        p_store_product_id: null,
      }),
    )
  })

  it('storeProductId が RPC に p_store_product_id として渡る', async () => {
    const supabase = createMockSupabase({
      rpc: {
        data: { ...rpcBookRow, store_product_id: 'B0ABCDEFGH' },
        error: null,
      },
    })

    await insertBook(supabase, {
      title: 'ワンピース',
      author: '尾田栄一郎',
      volumeNumber: 107,
      store: 'kindle',
      storeProductId: 'B0ABCDEFGH',
    })

    const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
    expect(mockSupabase.rpc).toHaveBeenCalledWith(
      'upsert_book_with_series',
      expect.objectContaining({ p_store_product_id: 'B0ABCDEFGH' }),
    )
  })

  it('RPC エラー時に throw する', async () => {
    const supabase = createMockSupabase({
      rpc: { data: null, error: { message: 'RLS violation' } },
    })

    await expect(
      insertBook(supabase, {
        title: 'test',
        author: 'author',
        store: 'kindle',
        isAdult: false,
      }),
    ).rejects.toThrow('upsert_book_with_series RPC failed')
  })

  it('RPC が null を返した場合に throw する (defensive check)', async () => {
    const supabase = createMockSupabase({
      rpc: { data: null, error: null },
    })

    await expect(
      insertBook(supabase, {
        title: 'test',
        author: 'author',
        store: 'kindle',
        isAdult: false,
      }),
    ).rejects.toThrow('upsert_book_with_series returned no data')
  })
})
