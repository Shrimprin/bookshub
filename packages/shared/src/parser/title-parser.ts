import type { ScrapeBook, Store } from '../schemas/book-schema.js'

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

// Amazon Kindle / コミック系ストアの出版社ラベル (末尾のカッコ) を除去する。
// 例: 「チェンソーマン 10 (ジャンプコミックスDIGITAL)」 → 「チェンソーマン 10」
// 巻情報マッチング (数字のみのカッコ) を誤検知しないよう、コミック・文庫・
// ブックス・ライブラリ・DIGITAL のいずれかを含むラベルに限定する。
function stripTrailingLabel(text: string): string {
  return text
    .replace(
      /\s*[（(][^（(）)]*(?:コミック|文庫|ブックス|ライブラリ|DIGITAL)[^（(）)]*[）)]\s*$/i,
      '',
    )
    .trim()
}

// 巻数抽出と strip の規則ペア。extract で一致した最初の規則で巻数を決定し、
// 同じ規則の strip で series title から数字以降をまとめて除去する。
// `\d+` で完全な数字シーケンスをキャプチャしてから後段で 1-9999 (shared schema
// の制約) に合致するか検証する。
const VOLUME_RULES: Array<{ extract: RegExp; strip: RegExp }> = [
  { extract: /\s*第(\d+)巻/, strip: /\s*第\d+巻.*/ },
  { extract: /\s*(\d+)巻/, strip: /\s*\d+巻.*/ },
  // paren パターンのみ \d{1,3} で年号 (2024) や特典コード (12345) を排除
  { extract: /[（(](\d{1,3})[）)]/, strip: /\s*[（(]\d{1,3}[）)].*/ },
  { extract: /\s+Vol\.(\d+)/i, strip: /\s+Vol\.\d+.*/i },
  { extract: /\s+vol\s+(\d+)/i, strip: /\s+vol\s+\d+.*/i },
  // 末尾の裸の数字 (例: 「チェンソーマン 17」)
  // 先頭 3 文字以上のテキストが必要なので「3月のライオン」等の誤検知を避ける
  { extract: /.{3,}\s+(\d{1,3})$/, strip: /\s+\d{1,3}$/ },
  // タイトル途中の裸の数字 (Amazon Kindle でシリーズ名が巻数後に繰り返される特有パターン)
  // 例: 「東京喰種トーキョーグール 1 東京喰種トーキョーグール リマスター版」
  { extract: /^.{3,}?\s+(\d{1,3})\s+\S/, strip: /\s+\d{1,3}\s+.*/ },
]

const MIN_VOLUME = 1
const MAX_VOLUME = 9999

function findVolumeRule(
  title: string,
): { rule: (typeof VOLUME_RULES)[number]; volume: number } | undefined {
  const cleaned = stripTrailingLabel(normalizeDigits(title))
  for (const rule of VOLUME_RULES) {
    const match = cleaned.match(rule.extract)
    if (match?.[1]) {
      const volume = Number.parseInt(match[1], 10)
      if (Number.isInteger(volume) && volume >= MIN_VOLUME && volume <= MAX_VOLUME) {
        return { rule, volume }
      }
    }
  }
  return undefined
}

export function extractVolumeNumber(title: string): number | undefined {
  return findVolumeRule(title)?.volume
}

export function extractSeriesTitle(title: string): string {
  let cleaned = stripTrailingLabel(normalizeDigits(title))

  const matched = findVolumeRule(title)
  if (matched) {
    cleaned = cleaned.replace(matched.rule.strip, '')
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
