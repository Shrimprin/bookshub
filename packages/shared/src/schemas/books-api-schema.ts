import { z } from 'zod'
import { storeSchema, thumbnailUrlSchema } from './book-schema.js'

// --- パスパラメータ ---

export const userBookIdSchema = z.string().uuid()

// --- POST /api/books リクエスト ---

export const registerBookSchema = z.object({
  title: z.string().trim().min(1).max(500),
  author: z.string().trim().min(1).max(200),
  volumeNumber: z.number().int().positive().max(9999).optional(),
  store: storeSchema,
  thumbnailUrl: thumbnailUrlSchema.optional(),
  isbn: z
    .string()
    .regex(/^\d{10}(\d{3})?$/, 'ISBN は 10 桁または 13 桁の数字である必要があります')
    .optional(),
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '日付は YYYY-MM-DD 形式である必要があります')
    .optional(),
  isAdult: z.boolean().optional().default(false),
})

// --- PATCH /api/books/[id] リクエスト ---

export const updateUserBookSchema = z.object({
  store: storeSchema,
})

// --- GET /api/books クエリパラメータ ---

export const getBooksQuerySchema = z.object({
  q: z.string().min(2).max(200).optional(),
  store: storeSchema.optional(),
  isAdult: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

// --- レスポンス ---

export const bookWithStoreSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  author: z.string(),
  volumeNumber: z.number().int().positive().nullable(),
  thumbnailUrl: z.string().nullable(),
  isbn: z.string().nullable(),
  publishedAt: z.string().nullable(),
  isAdult: z.boolean(),
  createdAt: z.string(),
  userBookId: z.string().uuid(),
  store: storeSchema,
  userBookCreatedAt: z.string(),
})

export const getBooksResponseSchema = z.object({
  books: z.array(bookWithStoreSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
})

export const registerBookResponseSchema = z.object({
  book: bookWithStoreSchema,
  alreadyOwned: z.boolean(),
  existingStores: z.array(storeSchema),
})

// --- 型 ---

export type UserBookId = z.infer<typeof userBookIdSchema>
export type RegisterBook = z.infer<typeof registerBookSchema>
export type UpdateUserBook = z.infer<typeof updateUserBookSchema>
export type GetBooksQuery = z.infer<typeof getBooksQuerySchema>
export type BookWithStore = z.infer<typeof bookWithStoreSchema>
export type GetBooksResponse = z.infer<typeof getBooksResponseSchema>
export type RegisterBookResponse = z.infer<typeof registerBookResponseSchema>
