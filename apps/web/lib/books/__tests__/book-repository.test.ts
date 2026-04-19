import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeText, findExistingBook, insertBook } from '../book-repository'

// --- Supabase mock helpers ---

type MockQueryResult = {
  data: Record<string, unknown>[] | null
  error: { message: string; code?: string } | null
}

type MockRpcResult = {
  data: Record<string, unknown> | null
  error: { message: string; code?: string } | null
}

function createMockSupabase(options: {
  books?: {
    select?: MockQueryResult
  }
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
      if (table === 'books') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi
                  .fn()
                  .mockReturnValue(
                    Promise.resolve(options.books?.select ?? { data: [], error: null }),
                  ),
                eq: vi
                  .fn()
                  .mockReturnValue(
                    Promise.resolve(options.books?.select ?? { data: [], error: null }),
                  ),
              }),
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
    // NFD（分解形式）の文字が NFC（合成形式）に変換される
    const nfd = 'が' // U+304B U+3099（か + 濁点）
    const nfc = nfd.normalize('NFC')
    expect(normalizeText(nfd)).toBe(nfc)
  })

  it('空文字をそのまま返す', () => {
    expect(normalizeText('')).toBe('')
  })
})

// --- findExistingBook ---

describe('findExistingBook', () => {
  it('既存の書籍が見つかった場合はレコードを返す', async () => {
    const existing = {
      id: 'book-1',
      series_id: 'series-1',
      title: 'ワンピース',
      author: '尾田栄一郎',
      volume_number: 107,
      thumbnail_url: null,
      isbn: null,
      published_at: null,
      is_adult: false,
      store_product_id: null,
    }
    const supabase = createMockSupabase({
      books: { select: { data: [existing], error: null } },
    })

    const result = await findExistingBook(supabase, 'ワンピース', '尾田栄一郎', 107)
    expect(result).toEqual(existing)
  })

  it('既存の書籍が見つからない場合は null を返す', async () => {
    const supabase = createMockSupabase({
      books: { select: { data: [], error: null } },
    })

    const result = await findExistingBook(supabase, 'ワンピース', '尾田栄一郎', 107)
    expect(result).toBeNull()
  })

  it('volumeNumber が undefined の場合は IS NULL でクエリする', async () => {
    const supabase = createMockSupabase({
      books: { select: { data: [], error: null } },
    })

    await findExistingBook(supabase, '火花', '又吉直樹', undefined)

    // from('books') が呼ばれたことを確認
    expect(supabase.from).toHaveBeenCalledWith('books')
  })

  it('SELECT エラー時に throw する', async () => {
    const supabase = createMockSupabase({
      books: { select: { data: null, error: { message: 'DB error' } } },
    })

    await expect(findExistingBook(supabase, 'test', 'author', 1)).rejects.toThrow(
      'books SELECT failed',
    )
  })
})

// --- insertBook (RPC upsert_book_with_series) ---

describe('insertBook', () => {
  const insertedRow = {
    id: 'new-id',
    series_id: 'series-1',
    title: 'ワンピース',
    author: '尾田栄一郎',
    volume_number: 107,
    thumbnail_url: null,
    isbn: null,
    published_at: null,
    is_adult: false,
    store_product_id: null,
  }

  it('upsert_book_with_series RPC を呼び出して結果を返す', async () => {
    const supabase = createMockSupabase({
      rpc: { data: insertedRow, error: null },
    })

    const result = await insertBook(supabase, {
      title: 'ワンピース',
      author: '尾田栄一郎',
      volumeNumber: 107,
      store: 'kindle',
      isAdult: false,
    })

    expect(result).toEqual(insertedRow)
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

  it('series と books を atomic に登録するため RPC が呼ばれる (orphan series 対策)', async () => {
    const supabase = createMockSupabase({
      rpc: { data: insertedRow, error: null },
    })

    await insertBook(supabase, {
      title: 'ワンピース',
      author: '尾田栄一郎',
      volumeNumber: 107,
      store: 'kindle',
      isAdult: false,
    })

    // クライアント側での series upsert → books insert の 2 リクエスト構成ではなく、
    // RPC 1 発で atomic 化されていることを確認。
    const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
    expect(mockSupabase.rpc).toHaveBeenCalledTimes(1)
  })

  it('title / author は NFC 正規化されて RPC に渡る', async () => {
    const supabase = createMockSupabase({
      rpc: { data: insertedRow, error: null },
    })

    await insertBook(supabase, {
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
  })

  it('optional フィールド未指定時は NULL / false がパラメータに入る', async () => {
    const supabase = createMockSupabase({
      rpc: { data: insertedRow, error: null },
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
      rpc: { data: { ...insertedRow, store_product_id: 'B0ABCDEFGH' }, error: null },
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
