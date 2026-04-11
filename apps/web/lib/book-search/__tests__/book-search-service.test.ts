vi.mock('../rakuten-client', () => ({
  searchRakutenBooks: vi.fn(),
}))

vi.mock('../google-client', () => ({
  searchGoogleBooks: vi.fn(),
}))

import { searchBooks } from '../book-search-service'
import { searchRakutenBooks } from '../rakuten-client'
import { searchGoogleBooks } from '../google-client'
import type { BookSearchClientResult } from '../types'

afterEach(() => {
  vi.unstubAllEnvs()
})

const rakutenResult: BookSearchClientResult = {
  items: [
    {
      title: 'ONE PIECE 107',
      author: '尾田栄���郎',
      isbn: '9784088838625',
      volumeNumber: 107,
      thumbnailUrl: 'https://thumbnail.image.rakuten.co.jp/test.jpg',
      publishedAt: '2024-03-04',
    },
  ],
  totalCount: 83,
}

const googleResult: BookSearchClientResult = {
  items: [
    {
      title: 'ONE PIECE 107',
      author: '尾田栄一郎',
      isbn: '9784088838625',
      volumeNumber: 107,
      thumbnailUrl: 'https://books.google.com/test.jpg',
      publishedAt: '2024-03-04',
    },
  ],
  totalCount: 150,
}

describe('searchBooks', () => {
  describe('楽天成功', () => {
    it('楽天の結果を source: rakuten で返す', async () => {
      vi.stubEnv('RAKUTEN_APP_ID', 'test-id')
      vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'test-key')
      vi.mocked(searchRakutenBooks).mockResolvedValue(rakutenResult)

      const result = await searchBooks({ query: 'ONE PIECE' })

      expect(result.source).toBe('rakuten')
      expect(result.items).toHaveLength(1)
      expect(result.totalCount).toBe(83)
      expect(searchGoogleBooks).not.toHaveBeenCalled()
    })
  })

  describe('楽天0件 → Google フォールバック', () => {
    it('Google の結果を source: google で返す', async () => {
      vi.stubEnv('RAKUTEN_APP_ID', 'test-id')
      vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'test-key')
      vi.mocked(searchRakutenBooks).mockResolvedValue({ items: [], totalCount: 0 })
      vi.mocked(searchGoogleBooks).mockResolvedValue(googleResult)

      const result = await searchBooks({ query: 'unknown title' })

      expect(result.source).toBe('google')
      expect(result.items).toHaveLength(1)
    })
  })

  describe('楽天エラー → Google フォ���ルバック', () => {
    it('Google の結果を source: google で返す', async () => {
      vi.stubEnv('RAKUTEN_APP_ID', 'test-id')
      vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'test-key')
      vi.mocked(searchRakutenBooks).mockRejectedValue(new Error('HTTP 500'))
      vi.mocked(searchGoogleBooks).mockResolvedValue(googleResult)

      const result = await searchBooks({ query: 'ONE PIECE' })

      expect(result.source).toBe('google')
      expect(result.items).toHaveLength(1)
    })
  })

  describe('両方失敗', () => {
    it('source: none とエラーメッセージを返す', async () => {
      vi.stubEnv('RAKUTEN_APP_ID', 'test-id')
      vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'test-key')
      vi.mocked(searchRakutenBooks).mockRejectedValue(new Error('rakuten error'))
      vi.mocked(searchGoogleBooks).mockRejectedValue(new Error('google error'))

      const result = await searchBooks({ query: 'test' })

      expect(result.source).toBe('none')
      expect(result.items).toHaveLength(0)
      expect(result.totalCount).toBe(0)
      expect('error' in result && result.error).toBeTruthy()
    })
  })

  describe('楽天キーのみ設定', () => {
    it('楽天のみで検索する', async () => {
      vi.stubEnv('RAKUTEN_APP_ID', 'test-id')
      vi.stubEnv('GOOGLE_BOOKS_API_KEY', '')
      vi.mocked(searchRakutenBooks).mockResolvedValue(rakutenResult)

      const result = await searchBooks({ query: 'ONE PIECE' })

      expect(result.source).toBe('rakuten')
      expect(searchGoogleBooks).not.toHaveBeenCalled()
    })

    it('楽天が失敗し Google キーなしの場合 source: none を返す', async () => {
      vi.stubEnv('RAKUTEN_APP_ID', 'test-id')
      vi.stubEnv('GOOGLE_BOOKS_API_KEY', '')
      vi.mocked(searchRakutenBooks).mockRejectedValue(new Error('error'))

      const result = await searchBooks({ query: 'test' })

      expect(result.source).toBe('none')
    })
  })

  describe('Google キーのみ設定', () => {
    it('Google のみで検索する', async () => {
      vi.stubEnv('RAKUTEN_APP_ID', '')
      vi.stubEnv('GOOGLE_BOOKS_API_KEY', 'test-key')
      vi.mocked(searchGoogleBooks).mockResolvedValue(googleResult)

      const result = await searchBooks({ query: 'ONE PIECE' })

      expect(result.source).toBe('google')
      expect(searchRakutenBooks).not.toHaveBeenCalled()
    })
  })

  describe('両方のキー未設定', () => {
    it('source: none と no_api_keys_configured エラーを返す', async () => {
      vi.stubEnv('RAKUTEN_APP_ID', '')
      vi.stubEnv('GOOGLE_BOOKS_API_KEY', '')

      const result = await searchBooks({ query: 'test' })

      expect(result.source).toBe('none')
      expect(result.items).toHaveLength(0)
      expect('error' in result && result.error).toBe('no_api_keys_configured')
    })
  })

  describe('hasMore', () => {
    it('結果がまだある場合 hasMore: true', async () => {
      vi.stubEnv('RAKUTEN_APP_ID', 'test-id')
      vi.mocked(searchRakutenBooks).mockResolvedValue(rakutenResult)

      // totalCount=83, limit=10(default), page=1 → まだ結果がある
      const result = await searchBooks({ query: 'ONE PIECE' })

      expect(result.hasMore).toBe(true)
    })

    it('最終ページの場合 hasMore: false', async () => {
      vi.stubEnv('RAKUTEN_APP_ID', 'test-id')
      vi.stubEnv('GOOGLE_BOOKS_API_KEY', '')
      vi.mocked(searchRakutenBooks).mockResolvedValue({ items: [], totalCount: 5 })

      const result = await searchBooks({ query: 'short list', limit: 10 })

      // 楽天0件 + Googleキーなし → source: none, hasMore: false
      expect(result.hasMore).toBe(false)
    })
  })
})
