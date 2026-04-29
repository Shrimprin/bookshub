import type { ScrapeBook, RawBookData } from '@bookhub/shared'
import { parseBooks } from '@bookhub/shared'
import { sendScrapedBooks } from './shared/sender.js'
import {
  STALE_TTL_MS,
  buildPageUrl,
  canonicalUrl,
  createEmptySession,
  extractPageNumber,
  isSessionStale,
  mergeBooks,
  shouldStopForSafety,
  type ScrapeSession,
} from './shared/scrape-session.js'
import {
  clearKindleScrapeTrigger,
  clearScrapeSession,
  getKindleScrapeTrigger,
  getScrapeSession,
  setScrapeSession,
} from '../utils/storage.js'
import { TRIGGER_TTL_MS } from '../utils/constants.js'

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

// ASIN を 10 桁の英数字に限定するガード (Kindle ASIN は B0XXXXXXXX 形式)
// 万一不正な値を引き当てても Amazon の画像 URL パターンを壊さないよう保険として検証する。
function isValidAsin(asin: string): boolean {
  return /^[A-Z0-9]{10}$/.test(asin)
}

// Amazon の汎用書影 URL パターン。P/<ASIN>.jpg は ASIN さえ正しければ存在し、
// Kindle のコンテンツリスト DOM 上に img が lazy-load されていなくても
// 確実にアクセスできる。ALLOWED_THUMBNAIL_HOSTS (m.media-amazon.com) に含まれる。
function buildAmazonThumbnailUrl(asin: string): string {
  return `https://m.media-amazon.com/images/P/${asin}.jpg`
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

    // サムネイル: ASIN から Amazon の書影 URL を直接組み立てる。
    // DOM 上の <img> は lazy-load や複数画像の混在で信頼できないため、
    // 一意に決まる ASIN ベースの URL パターンを優先する。
    const asin = extractAsin(titleCard)
    const hasValidAsin = !!asin && isValidAsin(asin)
    const thumbnailUrl = hasValidAsin ? buildAmazonThumbnailUrl(asin) : undefined
    // 不正な ASIN は deep link 生成時の URL 破壊要因になるため undefined で送る
    const storeProductId = hasValidAsin ? asin : undefined

    if (!title || !author) {
      console.warn(
        `${LOG_PREFIX} skipping ASIN=${asin ?? '?'} (title="${title}", author="${author}", cardRoot=${cardRoot ? 'found' : 'null'})`,
      )
      continue
    }

    books.push({ title, author, thumbnailUrl, storeProductId })
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

// 指定したページ番号のリンク要素を探す。
// Amazon Kindle のページネーションは「1, 2, 3, 4, >>, 16」のような数字リンクで、
// 次へボタンは存在しない。currentPage+1 のリンクを文字列マッチで探す。
//
// pagination コンテナを優先して探索することで、ページ内に偶然存在する数字テキスト
// (例: 書籍数バッジ・カテゴリリンク・別ナビゲーション) との誤検知を防ぐ。
const PAGINATION_CONTAINER_SELECTORS = [
  '[class*="pagination"]',
  '[class*="Pagination"]',
  '[id*="pagination"]',
  'nav',
  'ul.a-pagination',
] as const

function findPageLinkByNumber(pageNum: number): HTMLElement | null {
  const target = String(pageNum)

  // 1. pagination 専用コンテナがあればそこから探す
  for (const containerSel of PAGINATION_CONTAINER_SELECTORS) {
    const containers = document.querySelectorAll<HTMLElement>(containerSel)
    for (const container of containers) {
      const found = findPageLinkInContainer(container, target)
      if (found) return found
    }
  }

  // 2. フォールバック: document 全体から (Amazon の DOM 変更で container 検出が
  //    失敗したケース向け)。範囲は広いが children.length 制限で誤検知を抑える。
  //    フォールバックに到達した = pagination セレクタが Amazon DOM 変更で機能して
  //    いない可能性が高いので警告を出す (誤クリックで意図しないナビゲーションを
  //    引き起こす前に運用側で気付けるように)
  const fallback = findPageLinkInContainer(document.body, target)
  if (fallback) {
    console.warn(
      `${LOG_PREFIX} pagination container selectors failed; using document.body fallback for page ${pageNum}. Amazon DOM may have changed`,
    )
  }
  return fallback
}

function findPageLinkInContainer(container: Element, target: string): HTMLElement | null {
  const candidates = container.querySelectorAll<HTMLElement>(
    'a, button, [role="button"], li, span, div',
  )
  for (const el of candidates) {
    // 子要素が多い要素は誤検知の元になるのでスキップ (テキストのみのリンク要素を狙う)
    if (el.children.length > 1) continue
    const text = el.textContent?.trim() ?? ''
    if (text !== target) continue
    // 非表示要素はスキップ
    if (el.offsetParent === null && el.tagName !== 'A') continue
    return el
  }
  return null
}

// テスト時に差し替え可能にするため _internals オブジェクト経由で呼ぶ
// (ESM では vi.spyOn で named export を直接 spy できないため)
//
// SECURITY: navigateTo に渡す URL は必ず `currentUrl = window.location.href` から
// buildPageUrl で構築すること。session.originalUrl など storage 由来の値は
// `javascript:` / `data:` 等の任意 URL に改ざんされうるため navigate には使わない。
// originalUrl は loadOrCreateSession の比較 (===) でのみ使用する。
export const _internals = {
  navigateTo(url: string): void {
    window.location.href = url
  },
}

function logParsedBooks(books: ScrapeBook[]): void {
  const withVolume = books.filter((b) => b.volumeNumber !== undefined).length
  const withoutVolume = books.length - withVolume
  console.log(
    `${LOG_PREFIX} parsed ${books.length} books (${withVolume} with volume, ${withoutVolume} without)`,
  )
  console.log(
    `${LOG_PREFIX} sample:`,
    books.slice(0, 5).map((b) => ({ title: b.title, volume: b.volumeNumber, author: b.author })),
  )
}

async function loadOrCreateSession(
  currentUrl: string,
  currentPage: number,
): Promise<ScrapeSession> {
  const existing = await getScrapeSession()
  const now = Date.now()

  if (!existing) {
    console.log(`${LOG_PREFIX} no existing session, creating new`)
    return createEmptySession(currentUrl, now)
  }

  // ステイル判定
  if (isSessionStale(existing, now, STALE_TTL_MS)) {
    console.log(
      `${LOG_PREFIX} existing session is stale (age=${Math.round((now - existing.startedAt) / 1000)}s), discarding`,
    )
    await clearScrapeSession()
    return createEmptySession(currentUrl, now)
  }

  // 別 URL (ソート変更等) 検知
  const currentCanonical = canonicalUrl(currentUrl)
  if (existing.originalUrl !== currentCanonical) {
    console.log(
      `${LOG_PREFIX} session originalUrl differs (${existing.originalUrl} vs ${currentCanonical}), discarding`,
    )
    await clearScrapeSession()
    return createEmptySession(currentUrl, now)
  }

  // pageNumber=1 で既存セッションがある = ユーザーが手動で先頭に戻った
  if (currentPage === 1 && existing.lastPageScraped > 0) {
    console.log(`${LOG_PREFIX} restarted at page 1, discarding existing session`)
    await clearScrapeSession()
    return createEmptySession(currentUrl, now)
  }

  // 連続性チェック: lastPageScraped+1 (次ページへの正常遷移) または
  // currentPage === lastPageScraped (同じページのリロード = 後段でスキップされる) のみ許容
  if (currentPage !== existing.lastPageScraped && currentPage !== existing.lastPageScraped + 1) {
    console.log(
      `${LOG_PREFIX} page jump detected (lastScraped=${existing.lastPageScraped}, current=${currentPage}), discarding session`,
    )
    await clearScrapeSession()
    return createEmptySession(currentUrl, now)
  }

  console.log(
    `${LOG_PREFIX} resuming session (lastScraped=${existing.lastPageScraped}, accumulated=${existing.books.length} books)`,
  )
  return existing
}

async function sendAndClear(books: ScrapeBook[]): Promise<void> {
  if (books.length === 0) {
    console.warn(`${LOG_PREFIX} 0 books to send, clearing session`)
    await clearScrapeSession()
    return
  }
  logParsedBooks(books)
  console.log(`${LOG_PREFIX} sending ${books.length} books to background...`)
  try {
    const response = await sendScrapedBooks(books)
    console.log(`${LOG_PREFIX} background response:`, response)
    // AUTH_ERROR / NETWORK_ERROR の場合はセッションを保持して再試行可能にする
    if (
      !response.success &&
      (response.code === 'AUTH_ERROR' || response.code === 'NETWORK_ERROR')
    ) {
      console.log(
        `${LOG_PREFIX} ${response.code}: keeping session for retry. Re-visit Kindle page after fixing the issue.`,
      )
      return
    }
    // 成功 or 復帰不能エラー: セッションをクリア
    await clearScrapeSession()
  } catch (error) {
    console.error(`${LOG_PREFIX} sendScrapedBooks failed:`, error)
    // ネットワーク例外は保持
  }
}

export async function main(): Promise<void> {
  console.log(`${LOG_PREFIX} content script loaded at ${window.location.href}`)

  if (!isKindleContentPage()) {
    console.log(`${LOG_PREFIX} not a Kindle content list page, skipping`)
    return
  }

  // Web 本棚からの明示的トリガーが無ければ何もしない (自動スクレイプ廃止)。
  // ユーザーが Kindle ページを単に閲覧したいだけのケースを尊重する。
  const trigger = await getKindleScrapeTrigger()
  if (!trigger) {
    console.log(`${LOG_PREFIX} no active trigger, skipping (manual visit)`)
    return
  }
  if (Date.now() - trigger.startedAt > TRIGGER_TTL_MS) {
    console.warn(`${LOG_PREFIX} stale trigger (>${TRIGGER_TTL_MS}ms old), clearing`)
    await clearKindleScrapeTrigger()
    return
  }

  console.log(`${LOG_PREFIX} waiting for book items to appear...`)
  const found = await waitForElement(SELECTORS.titleCard, 10_000)

  if (!found) {
    console.warn(`${LOG_PREFIX} no title cards appeared within 10s`)
    return
  }

  const currentUrl = window.location.href
  const currentPage = extractPageNumber(currentUrl)
  console.log(`${LOG_PREFIX} current page: ${currentPage}`)

  // セッションをロード or 新規作成
  const session = await loadOrCreateSession(currentUrl, currentPage)

  // 同じページの再スクレイプを防止 (リロード等の二重実行)
  if (session.lastPageScraped >= currentPage) {
    console.log(
      `${LOG_PREFIX} page ${currentPage} already scraped (lastScraped=${session.lastPageScraped}), skipping`,
    )
    return
  }

  // 現在ページをスクレイプ
  const rawBooks = scrapeKindleBooks()
  if (rawBooks.length === 0) {
    console.warn(`${LOG_PREFIX} 0 books extracted on page ${currentPage}`)
    // 診断ログは Amazon の DOM (アカウント情報・CSRF token 等を含み得る) を
    // outerHTML で console に出力するため、開発ビルド時のみ有効にする
    if (currentPage === 1 && __IS_DEV__) {
      logCardStructureDiagnostics()
    }
  }

  const newBooks = parseBooks(rawBooks, 'kindle')
  const seen = new Set<string>(session.seenKeys)
  const merged = mergeBooks(session.books, newBooks, seen)
  const updatedSession: ScrapeSession = {
    ...session,
    lastPageScraped: currentPage,
    books: merged.books,
    seenKeys: Array.from(merged.seenKeys),
  }
  console.log(
    `${LOG_PREFIX} page ${currentPage}: +${newBooks.length} new books (total ${merged.books.length})`,
  )

  // セーフティ: 上限到達なら強制送信
  // セッションを必ず保存してから送信する: AUTH_ERROR / NETWORK_ERROR で sendAndClear が
  // セッションをクリアしないパスに入った場合、現ページの累積をディスクに残しておく必要がある
  // (ユーザーが再ログイン後にページ 1 へ戻ってもデータを失わないようにするため)
  if (shouldStopForSafety(merged.books.length, currentPage)) {
    console.log(
      `${LOG_PREFIX} safety limit reached (books=${merged.books.length}, page=${currentPage}), sending now`,
    )
    await setScrapeSession(updatedSession)
    await sendAndClear(merged.books)
    return
  }

  // 次ページの存在を確認
  const nextPageNum = currentPage + 1
  const nextLink = findPageLinkByNumber(nextPageNum)

  if (!nextLink) {
    // 最終ページ: 累積を送信してクリア (送信前にセッションを保存して retry 時の整合性を確保)
    console.log(`${LOG_PREFIX} no link to page ${nextPageNum} found, last page reached`)
    await setScrapeSession(updatedSession)
    await sendAndClear(merged.books)
    return
  }

  // 次ページがある: セッションを保存して URL ナビゲーション
  await setScrapeSession(updatedSession)
  const nextUrl = buildPageUrl(currentUrl, nextPageNum)
  console.log(`${LOG_PREFIX} navigating to page ${nextPageNum}: ${nextUrl}`)
  _internals.navigateTo(nextUrl)
}

main().catch((error) => {
  console.error(`${LOG_PREFIX} main() failed:`, error)
})
