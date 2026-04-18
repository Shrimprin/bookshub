import { buildStoreUrl } from '../deep-link'

describe('buildStoreUrl', () => {
  describe('kindle', () => {
    it('ASIN から Amazon 商品ページ URL を生成する', () => {
      expect(buildStoreUrl('kindle', 'B0XXXXXXXX')).toBe('https://www.amazon.co.jp/dp/B0XXXXXXXX')
    })

    it('スペース等を含む productId は encode される', () => {
      expect(buildStoreUrl('kindle', 'a b')).toBe('https://www.amazon.co.jp/dp/a%20b')
    })

    it('スラッシュを含む productId は encode される', () => {
      expect(buildStoreUrl('kindle', 'a/b')).toBe('https://www.amazon.co.jp/dp/a%2Fb')
    })
  })

  describe('dmm', () => {
    it('コンテンツ ID から DMM 商品ページ URL を生成する', () => {
      expect(buildStoreUrl('dmm', 'abc123')).toBe('https://book.dmm.com/product/abc123/')
    })

    it('スラッシュを含む productId は encode される', () => {
      expect(buildStoreUrl('dmm', 'abc/def')).toBe('https://book.dmm.com/product/abc%2Fdef/')
    })
  })

  describe('other', () => {
    it('productId があっても null を返す', () => {
      expect(buildStoreUrl('other', 'any-id')).toBeNull()
    })
  })

  describe('productId が null/空文字', () => {
    it('null productId は null を返す', () => {
      expect(buildStoreUrl('kindle', null)).toBeNull()
    })

    it('空文字 productId は null を返す', () => {
      expect(buildStoreUrl('kindle', '')).toBeNull()
    })

    it('other + null も null を返す', () => {
      expect(buildStoreUrl('other', null)).toBeNull()
    })
  })
})
