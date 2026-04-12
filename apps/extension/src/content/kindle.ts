import type { RawBookData } from './shared/parser.js'
import { parseBooks } from './shared/parser.js'
import { sendScrapedBooks } from './shared/sender.js'

const KINDLE_CONTENT_URL_PATTERN = 'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/'

const SELECTORS = {
  bookItem: '.ContentItem_container__heading',
  title: '.ContentItem_title__text',
  author: '.ContentItem_author__text',
  thumbnail: '.ContentItem_cover__image',
} as const satisfies Record<string, string>

export function isKindleContentPage(): boolean {
  return window.location.href.startsWith(KINDLE_CONTENT_URL_PATTERN)
}

export function scrapeKindleBooks(): RawBookData[] {
  const items = document.querySelectorAll(SELECTORS.bookItem)
  const books: RawBookData[] = []

  for (const item of items) {
    const titleEl = item.querySelector(SELECTORS.title)
    const authorEl = item.querySelector(SELECTORS.author)
    const thumbnailEl = item.querySelector<HTMLImageElement>(SELECTORS.thumbnail)

    const title = titleEl?.textContent?.trim() ?? ''
    const author = authorEl?.textContent?.trim() ?? ''

    if (!title || !author) continue

    books.push({
      title,
      author,
      thumbnailUrl: thumbnailEl?.src || undefined,
    })
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

export async function main(): Promise<void> {
  if (!isKindleContentPage()) return

  await waitForElement(SELECTORS.bookItem, 10_000)

  const rawBooks = scrapeKindleBooks()
  if (rawBooks.length === 0) return

  const books = parseBooks(rawBooks, 'kindle')
  if (books.length === 0) return

  await sendScrapedBooks(books)
}

main().catch((error) => {
  console.error('[BookHub] Kindle scraping failed:', error)
})
