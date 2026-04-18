import type { Store } from '../schemas/book-schema.js'

/**
 * ストアと商品IDから商品ページの deep link URL を生成する。
 * productId が null/空文字なら null を返す。
 * other ストアは公式 URL を持たないため null を返す。
 */
export function buildStoreUrl(store: Store, productId: string | null): string | null {
  if (!productId) return null
  switch (store) {
    case 'kindle':
      return `https://www.amazon.co.jp/dp/${encodeURIComponent(productId)}`
    case 'dmm':
      return `https://book.dmm.com/product/${encodeURIComponent(productId)}/`
    case 'other':
      return null
    default: {
      const _exhaustive: never = store
      return _exhaustive
    }
  }
}
