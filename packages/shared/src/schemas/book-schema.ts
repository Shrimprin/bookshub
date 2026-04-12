import { z } from 'zod'

export const storeSchema = z.enum(['kindle', 'dmm', 'other'])

// thumbnailUrl で許可するホスト一覧（ストア追加時にここへ追記）
// Web 側の CSP img-src も同じ値を参照するため export されている。
export const ALLOWED_THUMBNAIL_HOSTS = [
  'm.media-amazon.com',
  'images-na.ssl-images-amazon.com',
  'images-fe.ssl-images-amazon.com',
  'pics.dmm.co.jp',
  'p.dmm.co.jp',
  'thumbnail.image.rakuten.co.jp',
  'books.google.com',
] as const

export const thumbnailUrlSchema = z
  .string()
  .url()
  .startsWith('https://')
  .refine(
    (url) => {
      let hostname: string
      try {
        hostname = new URL(url).hostname
      } catch {
        return false
      }
      return ALLOWED_THUMBNAIL_HOSTS.some((h) => hostname === h || hostname.endsWith(`.${h}`))
    },
    { message: 'thumbnailUrl は許可されたドメインのみ使用可能です' },
  )

export const scrapeBookSchema = z.object({
  title: z.string().trim().min(1).max(500),
  author: z.string().trim().min(1).max(200),
  volumeNumber: z.number().int().positive().max(9999).optional(),
  store: storeSchema,
  thumbnailUrl: thumbnailUrlSchema.optional(),
  isbn: z
    .string()
    .regex(/^\d{10}(\d{3})?$/, 'ISBN は 10 桁または 13 桁の数字である必要があります')
    .optional(),
  isAdult: z.boolean().optional().default(false),
})

export const scrapePayloadSchema = z.object({
  books: z.array(scrapeBookSchema).min(1).max(500),
})

export type Store = z.infer<typeof storeSchema>
export type ScrapeBook = z.infer<typeof scrapeBookSchema>
export type ScrapePayload = z.infer<typeof scrapePayloadSchema>
