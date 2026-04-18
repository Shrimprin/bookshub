import type { Store } from '../schemas/book-schema.js'

export type { Store }

export interface Book {
  id: string
  title: string
  author: string
  volumeNumber?: number
  thumbnailUrl?: string
  isbn?: string
  publishedAt?: string
  isAdult: boolean
  storeProductId?: string
}

export interface NewBook {
  title: string
  author: string
  volumeNumber?: number
  thumbnailUrl?: string
  isbn?: string
  publishedAt?: string
  isAdult?: boolean
}

export interface UserBook {
  id: string
  userId: string
  bookId: string
  store: Store
  createdAt: string
  updatedAt: string
}
