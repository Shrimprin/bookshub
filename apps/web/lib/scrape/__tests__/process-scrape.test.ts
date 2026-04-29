import type { ScrapeBook } from '@bookhub/shared'
import { processScrapePayload } from '../process-scrape'

// --- Supabase mock helpers ---

type MockRow = Record<string, unknown>
type MockSingleResult = {
  data: MockRow | null
  error: { message: string; code?: string } | null
}
type MockQueryResult = { data: MockRow[] | null; error: { message: string; code?: string } | null }
type MockRpcResult = MockSingleResult

function createMockSupabase(handlers: {
  series?: { maybeSingle?: MockSingleResult }
  books?: {
    select?: MockQueryResult
  }
  user_books?: {
    select?: MockQueryResult
    upsert?: MockQueryResult
  }
  rpc?: MockRpcResult | ((name: string, params: Record<string, unknown>) => MockRpcResult)
}) {
  const rpcMock = vi.fn().mockImplementation((name: string, params: Record<string, unknown>) => {
    const resolved =
      typeof handlers.rpc === 'function'
        ? handlers.rpc(name, params)
        : (handlers.rpc ?? {
            data: {
              id: 'default-book-id',
              series_id: 'default-series-id',
              volume_number: (params.p_volume_number as number | null) ?? null,
              thumbnail_url: null,
              isbn: null,
              published_at: null,
              is_adult: (params.p_is_adult as boolean) ?? false,
              store_product_id: (params.p_store_product_id as string | null) ?? null,
            },
            error: null,
          })
    return {
      single: vi.fn().mockResolvedValue(resolved),
    }
  })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'series') {
      // findExistingBook: series.select('id').eq(title).eq(author).maybeSingle()
      // デフォルトでは series ヒットなし (null) → findExistingBook が null を返し
      // insertBook 経路に進む。
      const seriesResult = handlers.series?.maybeSingle ?? { data: null, error: null }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(seriesResult),
            }),
          }),
        }),
      }
    }
    if (table === 'books') {
      // findExistingBook 後半: books.select(...).eq(series_id).is/eq(volume_number)
      const booksResult = handlers.books?.select ?? { data: [], error: null }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockResolvedValue(booksResult),
            eq: vi.fn().mockResolvedValue(booksResult),
          }),
        }),
      }
    }
    if (table === 'user_books') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi
              .fn()
              .mockReturnValue(
                Promise.resolve(handlers.user_books?.select ?? { data: [], error: null }),
              ),
          }),
        }),
        upsert: vi
          .fn()
          .mockReturnValue(
            Promise.resolve(handlers.user_books?.upsert ?? { data: null, error: null }),
          ),
      }
    }
    return {}
  })

  return { from: fromMock, rpc: rpcMock } as unknown as Parameters<typeof processScrapePayload>[0]
}

// --- Test data ---

const userId = 'user-uuid-123'

const singleBook: ScrapeBook = {
  title: 'ワンピース',
  author: '尾田栄一郎',
  volumeNumber: 107,
  store: 'kindle',
  isAdult: false,
}

const adultBook: ScrapeBook = {
  title: 'テスト作品',
  author: 'テスト著者',
  store: 'dmm',
  isAdult: true,
}

// --- Tests ---

describe('processScrapePayload', () => {
  describe('入力正規化', () => {
    it('title と author の前後空白を除去する', async () => {
      const supabase = createMockSupabase({
        books: { select: { data: [], error: null } },
        rpc: {
          data: {
            id: 'book-1',
            series_id: 'series-1',
            title: 'テスト',
            author: '著者',
            volume_number: null,
            thumbnail_url: null,
            isbn: null,
            published_at: null,
            is_adult: false,
            store_product_id: null,
          },
          error: null,
        },
        user_books: {
          select: { data: [], error: null },
        },
      })

      const books: ScrapeBook[] = [
        { title: '  テスト  ', author: '  著者  ', store: 'kindle', isAdult: false },
      ]

      await processScrapePayload(supabase, userId, books)

      // 新規 series が RPC に trim 済みの値で渡ることを確認
      const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'upsert_book_with_series',
        expect.objectContaining({ p_title: 'テスト', p_author: '著者' }),
      )
    })

    it('リクエスト内の重複書籍を排除する', async () => {
      const supabase = createMockSupabase({
        books: { select: { data: [], error: null } },
        rpc: {
          data: {
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
          },
          error: null,
        },
        user_books: {
          select: { data: [], error: null },
        },
      })

      const duplicateBooks: ScrapeBook[] = [singleBook, { ...singleBook }]

      const result = await processScrapePayload(supabase, userId, duplicateBooks)

      // 重複が排除されて 1 冊として処理される
      expect(result.savedCount).toBe(1)
    })
  })

  describe('新規書籍の保存', () => {
    it('新規書籍を RPC で登録し user_books に upsert する', async () => {
      const supabase = createMockSupabase({
        books: { select: { data: [], error: null } },
        rpc: {
          data: {
            id: 'new-book-id',
            series_id: 'series-1',
            title: 'ワンピース',
            author: '尾田栄一郎',
            volume_number: 107,
            thumbnail_url: null,
            isbn: null,
            published_at: null,
            is_adult: false,
            store_product_id: null,
          },
          error: null,
        },
        user_books: {
          select: { data: [], error: null },
        },
      })

      const result = await processScrapePayload(supabase, userId, [singleBook])

      expect(result.savedCount).toBe(1)
      expect(result.duplicateCount).toBe(0)
      expect(result.duplicates).toEqual([])
    })

    it('isAdult フラグが RPC に p_is_adult として渡る', async () => {
      const supabase = createMockSupabase({
        books: { select: { data: [], error: null } },
        user_books: {
          select: { data: [], error: null },
        },
      })

      const result = await processScrapePayload(supabase, userId, [adultBook])

      expect(result.savedCount).toBe(1)
      const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'upsert_book_with_series',
        expect.objectContaining({ p_is_adult: true }),
      )
    })
  })

  describe('series upsert (#31)', () => {
    it('各書籍で upsert_book_with_series RPC が呼ばれる (series 自動作成)', async () => {
      const supabase = createMockSupabase({
        books: { select: { data: [], error: null } },
        user_books: { select: { data: [], error: null } },
      })

      await processScrapePayload(supabase, userId, [singleBook])

      const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'upsert_book_with_series',
        expect.objectContaining({
          p_title: 'ワンピース',
          p_author: '尾田栄一郎',
          p_volume_number: 107,
        }),
      )
    })

    it('同一シリーズの複数巻は同じ series_id を持つ書籍として扱える', async () => {
      const supabase = createMockSupabase({
        books: { select: { data: [], error: null } },
        user_books: { select: { data: [], error: null } },
        rpc: (_name, params) => ({
          // RPC は volume 毎に違う book id を返すが series_id は同じ
          data: {
            id: `book-vol-${params.p_volume_number}`,
            series_id: 'series-onepiece',
            title: params.p_title as string,
            author: params.p_author as string,
            volume_number: (params.p_volume_number as number | null) ?? null,
            thumbnail_url: null,
            isbn: null,
            published_at: null,
            is_adult: false,
            store_product_id: null,
          },
          error: null,
        }),
      })

      const books: ScrapeBook[] = [
        { ...singleBook, volumeNumber: 107 },
        { ...singleBook, volumeNumber: 108 },
      ]

      const result = await processScrapePayload(supabase, userId, books)

      expect(result.savedCount).toBe(2)
      const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(2)
    })

    it('RPC エラー時にエラーが伝播する', async () => {
      const supabase = createMockSupabase({
        books: { select: { data: [], error: null } },
        rpc: { data: null, error: { message: 'series RLS violation' } },
      })

      await expect(processScrapePayload(supabase, userId, [singleBook])).rejects.toThrow(
        'upsert_book_with_series RPC failed',
      )
    })
  })

  describe('重複検知（二度買い防止）', () => {
    it('異なるストアで既に所持している場合は duplicates に含める', async () => {
      const existingBookId = 'existing-book-id'
      const supabase = createMockSupabase({
        series: { maybeSingle: { data: { id: 'series-1' }, error: null } },
        books: {
          select: {
            data: [
              {
                id: existingBookId,
                series_id: 'series-1',
                volume_number: 107,
                thumbnail_url: null,
                isbn: null,
                published_at: null,
                is_adult: false,
                store_product_id: null,
                series: { title: 'ワンピース', author: '尾田栄一郎' },
              },
            ],
            error: null,
          },
        },
        user_books: {
          select: {
            data: [{ book_id: existingBookId, store: 'dmm' }],
            error: null,
          },
        },
      })

      // kindle で送信 → dmm で既に持っている
      const result = await processScrapePayload(supabase, userId, [singleBook])

      expect(result.savedCount).toBe(1)
      expect(result.duplicateCount).toBe(1)
      expect(result.duplicates).toEqual([
        {
          title: 'ワンピース',
          volumeNumber: 107,
          existingStores: ['dmm'],
        },
      ])
    })

    it('同一ストアの再送信は重複扱いにしない（冪等性）', async () => {
      const existingBookId = 'existing-book-id'
      const supabase = createMockSupabase({
        series: { maybeSingle: { data: { id: 'series-1' }, error: null } },
        books: {
          select: {
            data: [
              {
                id: existingBookId,
                series_id: 'series-1',
                volume_number: 107,
                thumbnail_url: null,
                isbn: null,
                published_at: null,
                is_adult: false,
                store_product_id: null,
                series: { title: 'ワンピース', author: '尾田栄一郎' },
              },
            ],
            error: null,
          },
        },
        user_books: {
          select: {
            data: [{ book_id: existingBookId, store: 'kindle' }],
            error: null,
          },
        },
      })

      const result = await processScrapePayload(supabase, userId, [singleBook])

      // 同一ストアで既に所持しているため savedCount は 0（upsert は no-op）
      expect(result.savedCount).toBe(0)
      expect(result.duplicateCount).toBe(0)
      expect(result.duplicates).toEqual([])
    })
  })

  describe('storeProductId (#32)', () => {
    it('storeProductId が RPC に p_store_product_id として渡る', async () => {
      const supabase = createMockSupabase({
        books: { select: { data: [], error: null } },
        user_books: { select: { data: [], error: null } },
      })

      const bookWithProductId: ScrapeBook = {
        ...singleBook,
        storeProductId: 'B0ABCDEFGH',
      }

      await processScrapePayload(supabase, userId, [bookWithProductId])

      const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'upsert_book_with_series',
        expect.objectContaining({ p_store_product_id: 'B0ABCDEFGH' }),
      )
    })

    it('storeProductId 未指定の書籍は p_store_product_id: null で RPC に渡る', async () => {
      const supabase = createMockSupabase({
        books: { select: { data: [], error: null } },
        user_books: { select: { data: [], error: null } },
      })

      await processScrapePayload(supabase, userId, [singleBook])

      const mockSupabase = supabase as unknown as { rpc: ReturnType<typeof vi.fn> }
      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        'upsert_book_with_series',
        expect.objectContaining({ p_store_product_id: null }),
      )
    })
  })

  describe('単巻作品（volumeNumber なし）', () => {
    it('volumeNumber が undefined でも正しく処理できる', async () => {
      const singleVolumeBook: ScrapeBook = {
        title: '火花',
        author: '又吉直樹',
        store: 'kindle',
        isAdult: false,
      }

      const supabase = createMockSupabase({
        books: { select: { data: [], error: null } },
        user_books: { select: { data: [], error: null } },
      })

      const result = await processScrapePayload(supabase, userId, [singleVolumeBook])

      expect(result.savedCount).toBe(1)
    })
  })

  describe('エラーハンドリング', () => {
    it('books INSERT 失敗時にエラーを throw する', async () => {
      const supabase = createMockSupabase({
        books: { select: { data: [], error: null } },
        rpc: { data: null, error: { message: 'DB error' } },
      })

      await expect(processScrapePayload(supabase, userId, [singleBook])).rejects.toThrow()
    })

    it('RPC が空データを返した場合にエラーを throw する', async () => {
      const supabase = createMockSupabase({
        books: { select: { data: [], error: null } },
        rpc: { data: null, error: null },
      })

      await expect(processScrapePayload(supabase, userId, [singleBook])).rejects.toThrow(
        'upsert_book_with_series returned no data',
      )
    })

    it('user_books UPSERT 失敗時にエラーを throw する', async () => {
      const supabase = createMockSupabase({
        series: { maybeSingle: { data: { id: 'series-1' }, error: null } },
        books: {
          select: {
            data: [
              {
                id: 'book-1',
                series_id: 'series-1',
                volume_number: 107,
                thumbnail_url: null,
                isbn: null,
                published_at: null,
                is_adult: false,
                store_product_id: null,
                series: { title: 'ワンピース', author: '尾田栄一郎' },
              },
            ],
            error: null,
          },
        },
        user_books: {
          select: { data: [], error: null },
          upsert: { data: null, error: { message: 'RLS violation' } },
        },
      })

      await expect(processScrapePayload(supabase, userId, [singleBook])).rejects.toThrow(
        'user_books UPSERT failed',
      )
    })
  })
})
