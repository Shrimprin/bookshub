import { z } from 'zod'

/**
 * 次巻ステータス。
 *  - unknown: Rakuten で N+1 巻が見つからない / 未 lookup
 *  - scheduled: 発売予定 (releaseDate 必須)
 *  - released: すでに発売済み
 */
export const nextVolumeStatusSchema = z.enum(['unknown', 'scheduled', 'released'])

/**
 * 楽天 salesDate を normalize したもの。YYYY-MM-DD / YYYY-MM / YYYY のいずれか。
 * `rakuten-client.ts#parseSalesDate` の出力に合わせる。
 */
const releaseDateSchema = z
  .string()
  .regex(
    /^\d{4}(-\d{2}(-\d{2})?)?$/,
    'releaseDate は YYYY-MM-DD / YYYY-MM / YYYY のいずれかである必要があります',
  )

export const nextVolumeInfoSchema = z.object({
  status: nextVolumeStatusSchema,
  expectedVolumeNumber: z.number().int().positive().nullable(),
  releaseDate: releaseDateSchema.nullable(),
  checkedAt: z.string().datetime(),
})

export type NextVolumeStatus = z.infer<typeof nextVolumeStatusSchema>
export type NextVolumeInfo = z.infer<typeof nextVolumeInfoSchema>
