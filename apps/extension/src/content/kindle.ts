import type { RawBookData } from './shared/parser.js'
import { parseBooks } from './shared/parser.js'
import { sendScrapedBooks } from './shared/sender.js'

const LOG_PREFIX = '[BookHub/Kindle]'

const KINDLE_CONTENT_URL_PATTERN =
  'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/'

// Amazon の Kindle コンテンツリストページでは、各書籍カードは
// `div[id^="content-title-"]` で識別できる (2024-2026 時点の DOM 構造)。
// タイトル・著者は card 内のテキストから id prefix ベースで抽出する。
const SELECTORS = {
  bookItem: 'div[id^="content-title-"]',
} as const satisfies Record<string, string>

export function isKindleContentPage(): boolean {
  return window.location.href.startsWith(KINDLE_CONTENT_URL_PATTERN)
}

// 書籍カードからタイトル要素を推定する。
// Amazon の難読化クラス名は頻繁に変わるため、以下の順で探す:
// 1. data-csa-c-content-id を持つ要素 (Amazon 公式の測定用属性)
// 2. id 属性が "title-" で始まる span/div
// 3. card 内で最もテキスト量の多い直接子要素
function extractTitle(card: Element): string {
  // 1. content-title-<ASIN> の id 値からタイトルを抽出できるかトライ
  const titleEl =
    card.querySelector('[id^="title-"]') ??
    card.querySelector('[data-csa-c-content-id]') ??
    card.querySelector('span[dir="auto"]')
  return titleEl?.textContent?.trim() ?? ''
}

function extractAuthor(card: Element): string {
  // 著者は card 内の「著者名:」や "By" を含むノード、
  // もしくは 2 番目の span[dir="auto"] にある可能性が高い
  const authorEl =
    card.querySelector('[id^="author-"]') ?? card.querySelectorAll('span[dir="auto"]')[1] ?? null
  return authorEl?.textContent?.trim() ?? ''
}

function extractThumbnail(card: Element): string | undefined {
  const img = card.querySelector<HTMLImageElement>('img')
  return img?.src || undefined
}

export function scrapeKindleBooks(): RawBookData[] {
  const items = document.querySelectorAll(SELECTORS.bookItem)
  console.log(`${LOG_PREFIX} found ${items.length} book items via "${SELECTORS.bookItem}"`)

  const books: RawBookData[] = []

  for (const item of items) {
    const title = extractTitle(item)
    const author = extractAuthor(item)
    const thumbnailUrl = extractThumbnail(item)

    if (!title || !author) {
      console.warn(`${LOG_PREFIX} skipping item (title="${title}", author="${author}")`, item)
      continue
    }

    books.push({ title, author, thumbnailUrl })
  }

  return books
}

export function waitForElement(selector: string, timeout = 10_000): Promise<Element | null> {
  const existing = document.querySelector(selector)
  if (existing) return Promise.resolve(existing)

  return new Promise((resolve) => {
    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el) {
        observer.disconnect()
        clearTimeout(timer)
        resolve(el)
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })

    const timer = setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeout)
  })
}

// 書籍要素が見つからない場合に、デバッグ用にページ内の候補要素を列挙する
function logDomDiagnostics(): void {
  const candidates = [
    'div[id^="content-title-"]',
    '[data-csa-c-type]',
    '.a-row',
    '#CONTENT_LIST',
    'div[data-asin]',
  ]
  console.log(`${LOG_PREFIX} --- DOM diagnostics ---`)
  for (const sel of candidates) {
    const count = document.querySelectorAll(sel).length
    console.log(`${LOG_PREFIX}   ${sel}: ${count} elements`)
  }
  console.log(`${LOG_PREFIX}   document.body.children.length: ${document.body.children.length}`)
  console.log(`${LOG_PREFIX}   document.title: ${document.title}`)
}

export async function main(): Promise<void> {
  console.log(`${LOG_PREFIX} content script loaded at ${window.location.href}`)

  if (!isKindleContentPage()) {
    console.log(`${LOG_PREFIX} not a Kindle content list page, skipping`)
    return
  }

  console.log(`${LOG_PREFIX} waiting for book items to appear...`)
  const found = await waitForElement(SELECTORS.bookItem, 10_000)

  if (!found) {
    console.warn(
      `${LOG_PREFIX} no book items appeared within 10s (selector: ${SELECTORS.bookItem})`,
    )
    logDomDiagnostics()
    return
  }

  const rawBooks = scrapeKindleBooks()
  if (rawBooks.length === 0) {
    console.warn(`${LOG_PREFIX} 0 books extracted, dumping diagnostics`)
    logDomDiagnostics()
    return
  }

  const books = parseBooks(rawBooks, 'kindle')
  console.log(`${LOG_PREFIX} parsed ${books.length} books, sending to background`)

  try {
    const response = await sendScrapedBooks(books)
    console.log(`${LOG_PREFIX} background response:`, response)
  } catch (error) {
    console.error(`${LOG_PREFIX} sendScrapedBooks failed:`, error)
  }
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} main() failed:`, error)
})
