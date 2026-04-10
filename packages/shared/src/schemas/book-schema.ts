import { z } from 'zod'

export const storeSchema = z.enum(['kindle', 'dmm', 'other'])

export const scrapeBookSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  volumeNumber: z.number().int().positive().optional(),
  store: storeSchema,
  thumbnailUrl: z.string().url().optional(),
  isbn: z.string().optional(),
})

export const scrapePayloadSchema = z.object({
  books: z.array(scrapeBookSchema).min(1),
})

export type ScrapeBook = z.infer<typeof scrapeBookSchema>
export type ScrapePayload = z.infer<typeof scrapePayloadSchema>
