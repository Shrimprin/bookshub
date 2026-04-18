import type { Store } from '../schemas/book-schema.js'

/**
 * ストアと商品IDから「そのまま本を読めるページ」の deep link URL を生成する。
 * productId が null/空文字なら null を返す。
 * other ストアは公式 URL を持たないため null を返す。
 *
 * Kindle: `https://read.amazon.co.jp/manga/<ASIN>` (Cloud Reader 漫画ビューア)。
 *   本プロダクトは漫画ヘビーユーザー向け (CLAUDE.md 参照) のため /manga/ パスを使う。
 *   購入前の商品ページ (`www.amazon.co.jp/dp/<ASIN>`) ではなく、所持済み前提で
 *   即時閲読できる URL を優先する。
 * DMM: `https://book.dmm.com/product/<id>/` 商品ページ。DMM Books のビューアは
 *   専用アプリ / `bookreader://` スキームでの深い deep link が別途必要になるため、
 *   現状は商品ページに留める (将来の改善項目)。
 */
export function buildStoreUrl(store: Store, productId: string | null): string | null {
  if (!productId) return null
  switch (store) {
    case 'kindle':
      return `https://read.amazon.co.jp/manga/${encodeURIComponent(productId)}`
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
