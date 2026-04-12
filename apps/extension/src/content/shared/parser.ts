import type { ScrapeBook, Store } from '@bookhub/shared'

export interface RawBookData {
  title: string
  author: string
  thumbnailUrl?: string
  isAdult?: boolean
}

const VOLUME_PATTERNS: RegExp[] = [
  /\s*第(\d+)巻/,
  /\s*(\d+)巻/,
  /[（(]\s*(\d+)\s*[）)]/,
  /\s+Vol\.(\d+)/i,
  /\s+vol\s+(\d+)/i,
]

export function extractVolumeNumber(title: string): number | undefined {
  for (const pattern of VOLUME_PATTERNS) {
    const match = title.match(pattern)
    if (match?.[1]) {
      return Number(match[1])
    }
  }
  return undefined
}

export function extractSeriesTitle(title: string): string {
  let cleaned = title

  for (const pattern of VOLUME_PATTERNS) {
    cleaned = cleaned.replace(pattern, '')
  }

  // 「特装版」等の巻数後の修飾語も除去
  cleaned = cleaned.replace(/\s+(特装版|限定版|通常版)$/, '')

  return cleaned.trim()
}

export function parseBooks(rawBooks: RawBookData[], store: Store): ScrapeBook[] {
  const result: ScrapeBook[] = []

  for (const raw of rawBooks) {
    const title = raw.title.trim()
    const author = raw.author.trim()

    if (!title || !author) continue

    const volumeNumber = extractVolumeNumber(title)
    const seriesTitle = extractSeriesTitle(title)

    let thumbnailUrl: string | undefined
    if (raw.thumbnailUrl && raw.thumbnailUrl.startsWith('https://')) {
      thumbnailUrl = raw.thumbnailUrl
    }

    result.push({
      title: seriesTitle,
      author,
      volumeNumber,
      store,
      thumbnailUrl,
      isAdult: raw.isAdult ?? false,
    })
  }

  return result
}
