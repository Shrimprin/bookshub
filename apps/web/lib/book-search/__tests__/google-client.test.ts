import googleResponse from './__fixtures__/google-response.json'
import { searchGoogleBooks } from '../google-client'

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

function stubGoogleEnv() {
  vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'test-api-key')
}

describe('searchGoogleBooks', () => {
  describe('正常系', () => {
    it('Google Books APIのレスポンスを正規化して返す', async () => {
      stubGoogleEnv()
      mockFetch(googleResponse)

      const result = await searchGoogleBooks({ query: 'ONE PIECE' })

      expect(result.totalCount).toBe(150)
      expect(result.items).toHaveLength(3)

      // 1件目: 巻数あり、サムネイルURLが https に変換されている
      expect(result.items[0]).toEqual({
        title: 'ONE PIECE 107',
        author: '尾田栄一郎',
        isbn: '9784088838625',
        volumeNumber: 107,
        thumbnailUrl:
          'https://books.google.com/books/content?id=abc123&printsec=frontcover&img=1&zoom=1',
        publishedAt: '2024-03-04',
      })

      // 2件目: publishedDate が YYYY-MM 形式
      expect(result.items[1]?.publishedAt).toBe('2023-10')

      // 3件目: 巻数なし、サムネイルなし
      expect(result.items[2]?.volumeNumber).toBeUndefined()
      expect(result.items[2]?.thumbnailUrl).toBeUndefined()
      expect(result.items[2]?.publishedAt).toBe('2015')
    })

    it('fetch に正しいURLとパラメータが渡される', async () => {
      stubGoogleEnv()
      mockFetch({ totalItems: 0 })

      await searchGoogleBooks({ query: 'ワンピース', page: 2, limit: 5 })

      const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0]
      const url = new URL(fetchCall?.[0] as string)

      expect(url.origin + url.pathname).toBe('https://www.googleapis.com/books/v1/volumes')
      expect(url.searchParams.get('key')).toBe('test-api-key')
      expect(url.searchParams.get('q')).toBe('ワンピース')
      expect(url.searchParams.get('maxResults')).toBe('5')
      // page=2, limit=5 -> startIndex=5
      expect(url.searchParams.get('startIndex')).toBe('5')
      expect(url.searchParams.get('langRestrict')).toBe('ja')
    })

    it('空の検索結果（items なし）を正しく処理する', async () => {
      stubGoogleEnv()
      mockFetch({ totalItems: 0 })

      const result = await searchGoogleBooks({ query: 'xxxnoexist' })

      expect(result.items).toHaveLength(0)
      expect(result.totalCount).toBe(0)
    })

    it('ISBN-13 を ISBN-10 より優先して取得する', async () => {
      stubGoogleEnv()
      mockFetch(googleResponse)

      const result = await searchGoogleBooks({ query: 'ONE PIECE' })

      // 1件目は ISBN_13 と ISBN_10 の両方がある → ISBN_13 を優先
      expect(result.items[0]?.isbn).toBe('9784088838625')
    })
  })

  describe('エラーハンドリング', () => {
    it('GOOGLE_BOOKS_API_KEY が未設定の場合エラーを throw する', async () => {
      vi.stubEnv('GOOGLE_BOOKS_API_KEY', '')

      await expect(searchGoogleBooks({ query: 'test' })).rejects.toThrow(
        'GOOGLE_BOOKS_API_KEY is not configured',
      )
    })

    it('HTTP 429 でエラーを throw する', async () => {
      stubGoogleEnv()
      mockFetch({ error: { message: 'rate limit' } }, 429)

      await expect(searchGoogleBooks({ query: 'test' })).rejects.toThrow()
    })

    it('HTTP 500 でエラーを throw する', async () => {
      stubGoogleEnv()
      mockFetch({ error: { message: 'internal' } }, 500)

      await expect(searchGoogleBooks({ query: 'test' })).rejects.toThrow()
    })

    it('ネットワークエラーでエラーを throw する', async () => {
      stubGoogleEnv()
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'))

      await expect(searchGoogleBooks({ query: 'test' })).rejects.toThrow()
    })

    it('レスポンスサイズ超過でエラーを throw する', async () => {
      stubGoogleEnv()
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        text: () => Promise.resolve('x'.repeat(1_100_000)),
      })

      await expect(searchGoogleBooks({ query: 'test' })).rejects.toThrow('response too large')
    })
  })
})
