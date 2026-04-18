import type { ScrapeBook, Store } from '@bookhub/shared'

export interface RawBookData {
  title: string
  author: string
  thumbnailUrl?: string
  isAdult?: boolean
  storeProductId?: string
}

// 全角数字 ０-９ (U+FF10-U+FF19) を半角 0-9 (U+0030-U+0039) に正規化する
// Amazon Kindle のタイトルは全角半角が混在するため (例: 「僕らはみんな河合荘（６）」)
function normalizeDigits(text: string): string {
  return text.replace(/[\uFF10-\uFF19]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30),
  )
}

// 巻数抽出パターン。`\d+` で完全な数字シーケンスをキャプチャしてから
// 後段で 1-9999 (shared schema の制約) に合致するか検証する。
// `\d{1,4}` のような桁数制限を正規表現側に置くと、`12345巻` の 2345 のように
// 部分マッチを誤って採用するリスクがあるため避ける。
const VOLUME_PATTERNS: RegExp[] = [
  /\s*第(\d+)巻/,
  /\s*(\d+)巻/,
  // paren パターンのみ \d{1,3} で年号 (2024) や特典コード (12345) を排除
  /[（(](\d{1,3})[）)]/,
  /\s+Vol\.(\d+)/i,
  /\s+vol\s+(\d+)/i,
  // フォールバック: タイトル末尾の裸の数字 (例: 「チェンソーマン 17」)
  // 先頭 3 文字以上のテキストが必要なので「3月のライオン」等の誤検知を避ける
  /.{3,}\s+(\d{1,3})$/,
]

const MIN_VOLUME = 1
const MAX_VOLUME = 9999

export function extractVolumeNumber(title: string): number | undefined {
  const normalized = normalizeDigits(title)
  for (const pattern of VOLUME_PATTERNS) {
    const match = normalized.match(pattern)
    if (match?.[1]) {
      const volume = Number.parseInt(match[1], 10)
      // shared schema の制約 (1..9999) に合致しない値は弾く
      if (Number.isInteger(volume) && volume >= MIN_VOLUME && volume <= MAX_VOLUME) {
        return volume
      }
    }
  }
  return undefined
}

export function extractSeriesTitle(title: string): string {
  let cleaned = normalizeDigits(title)

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
    if (!seriesTitle) continue

    let thumbnailUrl: string | undefined
    if (raw.thumbnailUrl && raw.thumbnailUrl.startsWith('https://')) {
      thumbnailUrl = raw.thumbnailUrl
    }

    const storeProductId = raw.storeProductId?.trim()

    result.push({
      title: seriesTitle,
      author,
      volumeNumber,
      store,
      thumbnailUrl,
      storeProductId: storeProductId || undefined,
      isAdult: raw.isAdult ?? false,
    })
  }

  return result
}
