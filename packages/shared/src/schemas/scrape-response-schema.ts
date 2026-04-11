import { z } from 'zod'
import { storeSchema } from './book-schema.js'

export const scrapeDuplicateSchema = z.object({
  title: z.string().min(1),
  volumeNumber: z.number().int().positive().optional(),
  existingStores: z.array(storeSchema).min(1),
})

export const scrapeResponseSchema = z.object({
  savedCount: z.number().int().nonnegative(),
  duplicateCount: z.number().int().nonnegative(),
  duplicates: z.array(scrapeDuplicateSchema),
})

export type ScrapeDuplicate = z.infer<typeof scrapeDuplicateSchema>
export type ScrapeResponse = z.infer<typeof scrapeResponseSchema>
