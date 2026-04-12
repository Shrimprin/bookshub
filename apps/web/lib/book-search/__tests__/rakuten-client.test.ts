import rakutenResponse from './__fixtures__/rakuten-response.json'
import { searchRakutenBooks } from '../rakuten-client'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
  vi.unstubAllEnvs()
})

function mockFetch(response: unknown, status = 200) {
  const text = JSON.stringify(response)
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    text: () => Promise.resolve(text),
  })
}

function stubRakutenEnv() {
  vi.stubEnv('RAKUTEN_APP_ID', 'test-app-id')
}

describe('searchRakutenBooks', () => {
  describe('正常系', () => {
    it('楽天APIのレスポンスを正規化して返す', async () => {
      stubRakutenEnv()
      mockFetch(rakutenResponse)

      const result = await searchRakutenBooks({ query: 'ONE PIECE' })

      expect(result.totalCount).toBe(83)
      expect(result.items).toHaveLength(3)

      // 1件目: 巻数あり
      expect(result.items[0]).toEqual({
        title: 'ONE PIECE 107',
        author: '尾田栄一郎',
        isbn: '9784088838625',
        volumeNumber: 107,
        thumbnailUrl:
          'https://thumbnail.image.rakuten.co.jp/@0_mall/book/cabinet/8625/9784088838625_1_2.jpg?_ex=200x200',
        publishedAt: '2024-03-04',
      })

      // 3件目: 巻数なし（総集編）
      expect(result.items[2]?.volumeNumber).toBeUndefined()
    })

    it('fetch に正しいURLとパラメータが渡される', async () => {
      stubRakutenEnv()
      mockFetch({ count: 0, page: 1, first: 0, last: 0, hits: 0, pageCount: 0, Items: [] })

      await searchRakutenBooks({ query: 'ワンピース', page: 2, limit: 5 })

      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0]
      const url = new URL(fetchCall?.[0] as string)

      expect(url.origin + url.pathname).toBe(
        'https://app.rakuten.co.jp/services/api/BooksBook/Search/20170404',
      )
      expect(url.searchParams.get('applicationId')).toBe('test-app-id')
      expect(url.searchParams.get('title')).toBe('ワンピース')
      expect(url.searchParams.get('hits')).toBe('5')
      expect(url.searchParams.get('page')).toBe('2')
    })

    it('1桁の月日を正しくパースする（例: 2024年3月4日）', async () => {
      stubRakutenEnv()
      const response = {
        count: 1,
        page: 1,
        first: 1,
        last: 1,
        hits: 1,
        pageCount: 1,
        Items: [
          {
            Item: {
              title: 'テスト書籍',
              author: 'テスト著者',
              isbn: '9784000000000',
              largeImageUrl: '',
              mediumImageUrl: '',
              salesDate: '2024年3月4日',
              itemPrice: 500,
              publisherName: 'テスト出版',
              booksGenreId: '001',
            },
          },
        ],
      }
      mockFetch(response)

      const result = await searchRakutenBooks({ query: 'テスト' })

      expect(result.items[0]?.publishedAt).toBe('2024-03-04')
    })

    it('年月のみの日付を正しくパースする（例: 2024年03月）', async () => {
      stubRakutenEnv()
      const response = {
        count: 1,
        page: 1,
        first: 1,
        last: 1,
        hits: 1,
        pageCount: 1,
        Items: [
          {
            Item: {
              title: 'テスト書籍',
              author: 'テスト著者',
              isbn: '9784000000000',
              largeImageUrl: '',
              mediumImageUrl: '',
              salesDate: '2024年03月中旬',
              itemPrice: 500,
              publisherName: 'テスト出版',
              booksGenreId: '001',
            },
          },
        ],
      }
      mockFetch(response)

      const result = await searchRakutenBooks({ query: 'テスト' })

      expect(result.items[0]?.publishedAt).toBe('2024-03')
    })

    it('年のみの日付を正しくパースする（例: 2024年）', async () => {
      stubRakutenEnv()
      const response = {
        count: 1,
        page: 1,
        first: 1,
        last: 1,
        hits: 1,
        pageCount: 1,
        Items: [
          {
            Item: {
              title: 'テスト書籍',
              author: 'テスト著者',
              isbn: '9784000000000',
              largeImageUrl: '',
              mediumImageUrl: '',
              salesDate: '2024年',
              itemPrice: 500,
              publisherName: 'テスト出版',
              booksGenreId: '001',
            },
          },
        ],
      }
      mockFetch(response)

      const result = await searchRakutenBooks({ query: 'テスト' })

      expect(result.items[0]?.publishedAt).toBe('2024')
    })

    it('「頃」付きの日付を正しくパースする', async () => {
      stubRakutenEnv()
      const response = {
        count: 1,
        page: 1,
        first: 1,
        last: 1,
        hits: 1,
        pageCount: 1,
        Items: [
          {
            Item: {
              title: 'テスト書籍',
              author: 'テスト著者',
              isbn: '9784000000000',
              largeImageUrl: '',
              mediumImageUrl: '',
              salesDate: '2024年03月04日頃',
              itemPrice: 500,
              publisherName: 'テスト出版',
              booksGenreId: '001',
            },
          },
        ],
      }
      mockFetch(response)

      const result = await searchRakutenBooks({ query: 'テスト' })

      expect(result.items[0]?.publishedAt).toBe('2024-03-04')
    })

    it('空の検索結果を正しく処理する', async () => {
      stubRakutenEnv()
      mockFetch({ count: 0, page: 1, first: 0, last: 0, hits: 0, pageCount: 0, Items: [] })

      const result = await searchRakutenBooks({ query: 'xxxnoexist' })

      expect(result.items).toHaveLength(0)
      expect(result.totalCount).toBe(0)
    })
  })

  describe('エラーハンドリング', () => {
    it('RAKUTEN_APP_ID が未設定の場合エラーを throw する', async () => {
      vi.stubEnv('RAKUTEN_APP_ID', '')

      await expect(searchRakutenBooks({ query: 'test' })).rejects.toThrow(
        'RAKUTEN_APP_ID is not configured',
      )
    })

    it('HTTP 429 でエラーを throw する', async () => {
      stubRakutenEnv()
      mockFetch({ error: 'too_many_requests' }, 429)

      await expect(searchRakutenBooks({ query: 'test' })).rejects.toThrow()
    })

    it('HTTP 500 でエラーを throw する', async () => {
      stubRakutenEnv()
      mockFetch({ error: 'internal_error' }, 500)

      await expect(searchRakutenBooks({ query: 'test' })).rejects.toThrow()
    })

    it('ネットワークエラーでエラーを throw する', async () => {
      stubRakutenEnv()
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))

      await expect(searchRakutenBooks({ query: 'test' })).rejects.toThrow()
    })

    it('レスポンスサイズ超過でエラーを throw する', async () => {
      stubRakutenEnv()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve('x'.repeat(1_100_000)),
      })

      await expect(searchRakutenBooks({ query: 'test' })).rejects.toThrow('response too large')
    })
  })
})
