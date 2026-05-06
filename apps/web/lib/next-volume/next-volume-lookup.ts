import type { NextVolumeInfo } from '@bookhub/shared'
import { searchRakutenBooks } from '../book-search/rakuten-client'
import { determineNextVolumeStatus } from './next-volume-status'

export type LookupNextVolumeParams = {
  seriesTitle: string
  author: string
  currentMaxVolume: number | null
}

/**
 * 楽天ブックスAPI でシリーズの次巻 (currentMaxVolume + 1) を検索し、
 * 巻数 + 著者一致を条件に NextVolumeInfo を返す。
 *
 * 一致なし / currentMaxVolume が null の場合は unknown。
 * Rakuten 側のエラーは throw を伝播 (呼び元で握り潰す)。
 */
export async function lookupNextVolume(params: LookupNextVolumeParams): Promise<NextVolumeInfo> {
  const { seriesTitle, author, currentMaxVolume } = params
  const checkedAt = new Date().toISOString()

  if (currentMaxVolume == null) {
    return { status: 'unknown', expectedVolumeNumber: null, releaseDate: null, checkedAt }
  }

  const expected = currentMaxVolume + 1
  const result = await searchRakutenBooks({
    query: `${seriesTitle} ${expected}`,
    limit: 10,
  })

  const normalizedAuthor = normalize(author)
  const match = result.items.find(
    (item) => item.volumeNumber === expected && authorMatches(item.author, normalizedAuthor),
  )

  if (!match) {
    return { status: 'unknown', expectedVolumeNumber: null, releaseDate: null, checkedAt }
  }

  const releaseDate = match.publishedAt ?? null
  const status = releaseDate
    ? determineNextVolumeStatus(releaseDate, new Date(checkedAt))
    : 'scheduled'

  return {
    status,
    expectedVolumeNumber: expected,
    releaseDate,
    checkedAt,
  }
}

function normalize(value: string): string {
  return value.replace(/[\s　]+/g, '').toLowerCase()
}

function authorMatches(rakutenAuthor: string, normalizedExpected: string): boolean {
  const normalizedRakuten = normalize(rakutenAuthor)
  return (
    normalizedRakuten.includes(normalizedExpected) || normalizedExpected.includes(normalizedRakuten)
  )
}
