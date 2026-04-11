import type { ScrapeBook } from '@bookhub/shared'
import { processScrapePayload } from '../process-scrape'

// --- Supabase mock helpers ---

type MockRow = Record<string, unknown>
type MockQueryResult = { data: MockRow[] | null; error: { message: string; code?: string } | null }

function createMockQueryBuilder(result: MockQueryResult) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    then: vi.fn().mockImplementation((resolve: (value: MockQueryResult) => void) => {
      resolve(result)
      return Promise.resolve(result)
    }),
  }
  // Make the builder thenable
  Object.defineProperty(builder, 'then', {
    value: (resolve: (value: MockQueryResult) => void) => {
      resolve(result)
      return Promise.resolve(result)
    },
  })
  return builder
}

function createMockSupabase(handlers: {
  books?: {
    select?: MockQueryResult
    insert?: MockQueryResult
  }
  user_books?: {
    select?: MockQueryResult
    upsert?: MockQueryResult
  }
}) {
  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'books') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi
                .fn()
                .mockReturnValue(
                  Promise.resolve(handlers.books?.select ?? { data: [], error: null }),
                ),
              eq: vi
                .fn()
                .mockReturnValue(
                  Promise.resolve(handlers.books?.select ?? { data: [], error: null }),
                ),
            }),
          }),
        }),
        insert: vi.fn().mockReturnValue({
          select: vi
            .fn()
            .mockReturnValue(Promise.resolve(handlers.books?.insert ?? { data: [], error: null })),
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
    return createMockQueryBuilder({ data: [], error: null })
  })

  return { from: fromMock } as unknown as Parameters<typeof processScrapePayload>[0]
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
        books: {
          select: { data: [], error: null },
          insert: {
            data: [
              {
                id: 'book-1',
                title: 'テスト',
                author: '著者',
                volume_number: null,
                thumbnail_url: null,
                isbn: null,
                published_at: null,
                is_adult: false,
              },
            ],
            error: null,
          },
        },
        user_books: {
          select: { data: [], error: null },
        },
      })

      const books: ScrapeBook[] = [
        { title: '  テスト  ', author: '  著者  ', store: 'kindle', isAdult: false },
      ]

      await processScrapePayload(supabase, userId, books)

      // books テーブルへの SELECT で trim された値が使われる
      const fromCalls = supabase.from.mock.calls
      const booksCall = fromCalls.find((c) => c[0] === 'books')
      expect(booksCall).toBeDefined()
    })

    it('リクエスト内の重複書籍を排除する', async () => {
      const supabase = createMockSupabase({
        books: {
          select: { data: [], error: null },
          insert: {
            data: [
              {
                id: 'book-1',
                title: 'ワンピース',
                author: '尾田栄一郎',
                volume_number: 107,
                thumbnail_url: null,
                isbn: null,
                published_at: null,
                is_adult: false,
              },
            ],
            error: null,
          },
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
    it('新規書籍を books に INSERT し user_books に upsert する', async () => {
      const supabase = createMockSupabase({
        books: {
          select: { data: [], error: null },
          insert: {
            data: [
              {
                id: 'new-book-id',
                title: 'ワンピース',
                author: '尾田栄一郎',
                volume_number: 107,
                thumbnail_url: null,
                isbn: null,
                published_at: null,
                is_adult: false,
              },
            ],
            error: null,
          },
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

    it('isAdult フラグが books INSERT に反映される', async () => {
      const supabase = createMockSupabase({
        books: {
          select: { data: [], error: null },
          insert: {
            data: [
              {
                id: 'adult-book-id',
                title: 'テスト作品',
                author: 'テスト著者',
                volume_number: null,
                thumbnail_url: null,
                isbn: null,
                published_at: null,
                is_adult: true,
              },
            ],
            error: null,
          },
        },
        user_books: {
          select: { data: [], error: null },
        },
      })

      const result = await processScrapePayload(supabase, userId, [adultBook])

      expect(result.savedCount).toBe(1)
    })
  })

  describe('重複検知（二度買い防止）', () => {
    it('異なるストアで既に所持している場合は duplicates に含める', async () => {
      const existingBookId = 'existing-book-id'
      const supabase = createMockSupabase({
        books: {
          select: {
            data: [
              {
                id: existingBookId,
                title: 'ワンピース',
                author: '尾田栄一郎',
                volume_number: 107,
                thumbnail_url: null,
                isbn: null,
                published_at: null,
                is_adult: false,
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
        books: {
          select: {
            data: [
              {
                id: existingBookId,
                title: 'ワンピース',
                author: '尾田栄一郎',
                volume_number: 107,
                thumbnail_url: null,
                isbn: null,
                published_at: null,
                is_adult: false,
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

  describe('単巻作品（volumeNumber なし）', () => {
    it('volumeNumber が undefined でも正しく処理できる', async () => {
      const singleVolumeBook: ScrapeBook = {
        title: '火花',
        author: '又吉直樹',
        store: 'kindle',
        isAdult: false,
      }

      const supabase = createMockSupabase({
        books: {
          select: { data: [], error: null },
          insert: {
            data: [
              {
                id: 'single-vol-id',
                title: '火花',
                author: '又吉直樹',
                volume_number: null,
                thumbnail_url: null,
                isbn: null,
                published_at: null,
                is_adult: false,
              },
            ],
            error: null,
          },
        },
        user_books: {
          select: { data: [], error: null },
        },
      })

      const result = await processScrapePayload(supabase, userId, [singleVolumeBook])

      expect(result.savedCount).toBe(1)
    })
  })

  describe('エラーハンドリング', () => {
    it('books INSERT 失敗時にエラーを throw する', async () => {
      const supabase = createMockSupabase({
        books: {
          select: { data: [], error: null },
          insert: { data: null, error: { message: 'DB error' } },
        },
      })

      await expect(processScrapePayload(supabase, userId, [singleBook])).rejects.toThrow()
    })

    it('books INSERT が空データを返した場合にエラーを throw する', async () => {
      const supabase = createMockSupabase({
        books: {
          select: { data: [], error: null },
          insert: { data: [], error: null },
        },
      })

      await expect(processScrapePayload(supabase, userId, [singleBook])).rejects.toThrow(
        'books INSERT returned no data',
      )
    })

    it('user_books UPSERT 失敗時にエラーを throw する', async () => {
      const supabase = createMockSupabase({
        books: {
          select: {
            data: [
              {
                id: 'book-1',
                title: 'ワンピース',
                author: '尾田栄一郎',
                volume_number: 107,
                thumbnail_url: null,
                isbn: null,
                published_at: null,
                is_adult: false,
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
