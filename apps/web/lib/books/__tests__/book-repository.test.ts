import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeText, findExistingBook, insertBook } from '../book-repository'

// --- Supabase mock helpers ---

type MockQueryResult = {
  data: Record<string, unknown>[] | null
  error: { message: string; code?: string } | null
}

function createMockSupabase(tableHandlers: {
  books?: {
    select?: MockQueryResult
    insert?: MockQueryResult
  }
}) {
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
                    Promise.resolve(tableHandlers.books?.select ?? { data: [], error: null }),
                  ),
                eq: vi
                  .fn()
                  .mockReturnValue(
                    Promise.resolve(tableHandlers.books?.select ?? { data: [], error: null }),
                  ),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi
              .fn()
              .mockReturnValue(
                Promise.resolve(tableHandlers.books?.insert ?? { data: [], error: null }),
              ),
          }),
        }
      }
      return {}
    }),
  } as unknown as SupabaseClient
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
      title: 'ワンピース',
      author: '尾田栄一郎',
      volume_number: 107,
      thumbnail_url: null,
      isbn: null,
      published_at: null,
      is_adult: false,
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

// --- insertBook ---

describe('insertBook', () => {
  it('正常に INSERT して結果を返す', async () => {
    const inserted = {
      id: 'new-id',
      title: 'ワンピース',
      author: '尾田栄一郎',
      volume_number: 107,
      thumbnail_url: null,
      isbn: null,
      published_at: null,
      is_adult: false,
    }
    const supabase = createMockSupabase({
      books: {
        select: { data: [], error: null },
        insert: { data: [inserted], error: null },
      },
    })

    const result = await insertBook(supabase, {
      title: 'ワンピース',
      author: '尾田栄一郎',
      volumeNumber: 107,
      store: 'kindle',
      isAdult: false,
    })

    expect(result).toEqual(inserted)
  })

  it('競合（23505）時に既存レコードを取得して返す', async () => {
    const existing = {
      id: 'existing-id',
      title: 'ワンピース',
      author: '尾田栄一郎',
      volume_number: 107,
      thumbnail_url: null,
      isbn: null,
      published_at: null,
      is_adult: false,
    }
    const supabase = createMockSupabase({
      books: {
        select: { data: [existing], error: null },
        insert: { data: null, error: { message: 'unique violation', code: '23505' } },
      },
    })

    const result = await insertBook(supabase, {
      title: 'ワンピース',
      author: '尾田栄一郎',
      volumeNumber: 107,
      store: 'kindle',
      isAdult: false,
    })

    expect(result).toEqual(existing)
  })

  it('INSERT エラー（競合以外）時に throw する', async () => {
    const supabase = createMockSupabase({
      books: {
        select: { data: [], error: null },
        insert: { data: null, error: { message: 'DB error' } },
      },
    })

    await expect(
      insertBook(supabase, {
        title: 'test',
        author: 'author',
        store: 'kindle',
        isAdult: false,
      }),
    ).rejects.toThrow('books INSERT failed')
  })

  it('INSERT が空データを返した場合に throw する', async () => {
    const supabase = createMockSupabase({
      books: {
        select: { data: [], error: null },
        insert: { data: [], error: null },
      },
    })

    await expect(
      insertBook(supabase, {
        title: 'test',
        author: 'author',
        store: 'kindle',
        isAdult: false,
      }),
    ).rejects.toThrow('books INSERT returned no data')
  })
})
