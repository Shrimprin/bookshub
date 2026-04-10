import type { Store } from '../schemas/book-schema.js'

export type { Store }

export interface Book {
  id: string
  title: string
  author: string
  thumbnailUrl?: string
  isAdult: boolean
}

export interface NewBook {
  title: string
  author: string
  thumbnailUrl?: string
}

export interface BookVolume {
  id: string
  bookId: string
  volumeNumber: number
  isbn?: string
  publishedAt?: string
}

export interface UserBook {
  id: string
  userId: string
  bookId: string
  store: Store
  maxVolumeOwned: number
  createdAt: string
  updatedAt: string
}
