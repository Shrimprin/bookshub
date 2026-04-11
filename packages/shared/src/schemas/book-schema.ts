import { z } from 'zod'

export const storeSchema = z.enum(['kindle', 'dmm', 'other'])

export const scrapeBookSchema = z.object({
  title: z.string().min(1).max(500),
  author: z.string().min(1).max(200),
  volumeNumber: z.number().int().positive().max(9999).optional(),
  store: storeSchema,
  thumbnailUrl: z.string().url().startsWith('https://').optional(),
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
