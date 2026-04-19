import type { Store } from '../schemas/book-schema.js'

export type { Store }

// 注意: 以下の Book / NewBook / UserBook interface は現状どこからも import されていない
// ドメインモデルの stub。将来 hand-rolled ドメイン層を導入する際のプレースホルダとして
// 残している。API 境界のシリアライズ型としては `BookWithStore` (books-api-schema.ts) を
// 使うこと。storeProductId は Zod schema と同じく `string | null` で表現する。

export interface Book {
  id: string
  title: string
  author: string
  volumeNumber?: number
  thumbnailUrl?: string
  isbn?: string
  publishedAt?: string
  isAdult: boolean
  storeProductId?: string | null
}

export interface NewBook {
  title: string
  author: string
  volumeNumber?: number
  thumbnailUrl?: string
  isbn?: string
  publishedAt?: string
  isAdult?: boolean
  storeProductId?: string | null
}

export interface UserBook {
  id: string
  userId: string
  bookId: string
  store: Store
  createdAt: string
  updatedAt: string
}
