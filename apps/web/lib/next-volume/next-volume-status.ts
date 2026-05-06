import type { NextVolumeStatus } from '@bookhub/shared'

/**
 * 楽天 salesDate を normalize した日付文字列 (YYYY-MM-DD / YYYY-MM / YYYY) と
 * 現在時刻を受け取り、次巻ステータスを返す。
 *
 *  - YYYY-MM-DD: 当日も「released」(発売日 = 今日は発売済扱い)
 *  - YYYY-MM:   当月末日 < today なら released
 *  - YYYY:      当年末 < today なら released
 *  - 不正:      unknown
 */
export function determineNextVolumeStatus(
  releaseDate: string | null,
  today: Date,
): NextVolumeStatus {
  if (!releaseDate) return 'unknown'

  const fullMatch = releaseDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (fullMatch) {
    const [, year, month, day] = fullMatch
    const releaseUtc = Date.UTC(Number(year), Number(month) - 1, Number(day))
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    return releaseUtc <= todayUtc ? 'released' : 'scheduled'
  }

  const monthMatch = releaseDate.match(/^(\d{4})-(\d{2})$/)
  if (monthMatch) {
    const [, year, month] = monthMatch
    // 当月末 23:59:59 UTC を境界に
    const endOfMonthUtc = Date.UTC(Number(year), Number(month), 0)
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    return endOfMonthUtc < todayUtc ? 'released' : 'scheduled'
  }

  const yearMatch = releaseDate.match(/^(\d{4})$/)
  if (yearMatch) {
    const [, year] = yearMatch
    const endOfYearUtc = Date.UTC(Number(year) + 1, 0, 0)
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
    return endOfYearUtc < todayUtc ? 'released' : 'scheduled'
  }

  return 'unknown'
}
