import type { RawBookData } from './shared/parser.js'
import { parseBooks } from './shared/parser.js'
import { sendScrapedBooks } from './shared/sender.js'

const LOG_PREFIX = '[BookHub/Kindle]'

const KINDLE_CONTENT_URL_PATTERN =
  'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/'

// Amazon の Kindle コンテンツリストページでは、各書籍のタイトル要素は
// `div[id="content-title-<ASIN>"]` で識別される (class="digital_entity_title")。
// 同じカード内の兄弟要素に著者要素 (`digital_entity_author`) が存在する。
const SELECTORS = {
  titleCard: 'div[id^="content-title-"]',
  titleText: 'div[role="heading"]',
} as const satisfies Record<string, string>

export function isKindleContentPage(): boolean {
  return window.location.href.startsWith(KINDLE_CONTENT_URL_PATTERN)
}

// タイトル要素から ASIN を抽出する (id="content-title-B0..." → "B0...")
function extractAsin(titleCard: Element): string | null {
  const id = titleCard.id
  if (!id.startsWith('content-title-')) return null
  return id.slice('content-title-'.length)
}

// タイトル要素の直近の祖先で、著者要素も含む「書籍カード全体」を見つける。
// 具体的には digital_entity_title と digital_entity_author を両方含む祖先要素。
function findBookCardRoot(titleCard: Element): Element | null {
  let current: Element | null = titleCard.parentElement
  while (current && current !== document.body) {
    // 著者要素を含む祖先を探す
    if (
      current.querySelector('.digital_entity_author') ??
      current.querySelector('[class*="author"]') ??
      current.querySelector('[id^="content-author-"]')
    ) {
      return current
    }
    current = current.parentElement
  }
  return null
}

export function scrapeKindleBooks(): RawBookData[] {
  const titleCards = document.querySelectorAll(SELECTORS.titleCard)
  console.log(`${LOG_PREFIX} found ${titleCards.length} title cards`)

  const books: RawBookData[] = []

  for (const titleCard of titleCards) {
    // タイトル抽出: div[role="heading"] の textContent
    const titleEl = titleCard.querySelector(SELECTORS.titleText)
    const title = titleEl?.textContent?.trim() ?? titleCard.textContent?.trim() ?? ''

    // カード全体 (著者要素を含む祖先) を見つける
    const cardRoot = findBookCardRoot(titleCard)

    // 著者抽出: カード全体の中から著者候補を探す
    const authorEl =
      cardRoot?.querySelector('.digital_entity_author') ??
      cardRoot?.querySelector('[class*="author"]') ??
      cardRoot?.querySelector('[id^="content-author-"]') ??
      null
    const author = authorEl?.textContent?.trim() ?? ''

    // サムネイル: カード全体から img を探す
    const img = cardRoot?.querySelector<HTMLImageElement>('img')
    const thumbnailUrl = img?.src || undefined

    if (!title || !author) {
      const asin = extractAsin(titleCard) ?? '?'
      console.warn(
        `${LOG_PREFIX} skipping ASIN=${asin} (title="${title}", author="${author}", cardRoot=${cardRoot ? 'found' : 'null'})`,
      )
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

// 書籍要素が見つかったが抽出に失敗した場合のデバッグ用ダンプ
function logCardStructureDiagnostics(): void {
  const titleCards = document.querySelectorAll(SELECTORS.titleCard)
  console.log(`${LOG_PREFIX} --- Card structure diagnostics ---`)
  console.log(`${LOG_PREFIX} total title cards: ${titleCards.length}`)

  const firstCard = titleCards[0]
  if (!firstCard) {
    console.log(`${LOG_PREFIX} no cards to dump`)
    return
  }

  // 最初のカードの構造をダンプ
  console.log(`${LOG_PREFIX} first card outerHTML (truncated 1000 chars):`)
  console.log(firstCard.outerHTML.slice(0, 1000))

  // 親要素の構造をダンプ (3 階層上まで)
  let ancestor: Element | null = firstCard.parentElement
  for (let i = 1; i <= 3 && ancestor; i++) {
    console.log(
      `${LOG_PREFIX} ancestor[${i}]: <${ancestor.tagName.toLowerCase()}${ancestor.id ? ` id="${ancestor.id}"` : ''}${ancestor.className ? ` class="${ancestor.className}"` : ''}>`,
    )
    console.log(`${LOG_PREFIX} ancestor[${i}] outerHTML (truncated 2000 chars):`)
    console.log(ancestor.outerHTML.slice(0, 2000))
    ancestor = ancestor.parentElement
  }

  // 著者候補の要素数を報告
  const authorCandidates = [
    '.digital_entity_author',
    '[class*="author"]',
    '[id^="content-author-"]',
    '[id*="author"]',
  ]
  console.log(`${LOG_PREFIX} author candidate counts:`)
  for (const sel of authorCandidates) {
    console.log(`${LOG_PREFIX}   ${sel}: ${document.querySelectorAll(sel).length}`)
  }
}

export async function main(): Promise<void> {
  console.log(`${LOG_PREFIX} content script loaded at ${window.location.href}`)

  if (!isKindleContentPage()) {
    console.log(`${LOG_PREFIX} not a Kindle content list page, skipping`)
    return
  }

  console.log(`${LOG_PREFIX} waiting for book items to appear...`)
  const found = await waitForElement(SELECTORS.titleCard, 10_000)

  if (!found) {
    console.warn(`${LOG_PREFIX} no title cards appeared within 10s`)
    return
  }

  const rawBooks = scrapeKindleBooks()
  if (rawBooks.length === 0) {
    console.warn(`${LOG_PREFIX} 0 books extracted, dumping card structure for investigation`)
    logCardStructureDiagnostics()
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
