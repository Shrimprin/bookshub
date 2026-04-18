// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SendScrapedBooksResponse } from '../../types/messages.js'

// vite define の代替 (テスト時)
vi.stubGlobal('__IS_DEV__', true)
vi.stubGlobal('__ALLOWED_EXTERNAL_ORIGINS__', ['http://localhost:3000'])
vi.stubGlobal('__API_BASE_URL__', 'http://localhost:3000')

// --- chrome API モック ---
const mockSendMessage = vi.fn()
const mockStorage = new Map<string, unknown>()

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: mockSendMessage,
  },
  storage: {
    local: {
      get: vi.fn((keys: string[]) => {
        const result: Record<string, unknown> = {}
        for (const key of keys) {
          const value = mockStorage.get(key)
          if (value !== undefined) result[key] = value
        }
        return Promise.resolve(result)
      }),
      set: vi.fn((items: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(items)) {
          mockStorage.set(key, value)
        }
        return Promise.resolve()
      }),
      remove: vi.fn((keys: string[]) => {
        for (const key of keys) {
          mockStorage.delete(key)
        }
        return Promise.resolve()
      }),
    },
  },
})

// --- DOM ヘルパー ---

let nextAsinCounter = 0

// 正しい Kindle ASIN 形式の合成 ID を生成する (B + 9 桁数字 = 10 桁)
function nextAsin(): string {
  return `B${String(nextAsinCounter++).padStart(9, '0')}`
}

// Amazon Kindle のコンテンツリストページ実 DOM 構造を模擬:
//   <div class="card">                           ← 書籍カード全体
//     <div id="content-title-<ASIN>"             ← タイトル要素
//          class="digital_entity_title">
//       <div role="heading">作品名</div>
//     </div>
//     <div class="digital_entity_author">著者名</div>
//     <img src="..." />
//   </div>
function createBookElement(opts: {
  title: string
  author: string
  thumbnailUrl?: string
  asin?: string
}): HTMLElement {
  const asin = opts.asin ?? nextAsin()
  const card = document.createElement('div')
  card.className = 'card'

  const titleCard = document.createElement('div')
  titleCard.id = `content-title-${asin}`
  titleCard.className = 'digital_entity_title'
  const heading = document.createElement('div')
  heading.setAttribute('role', 'heading')
  heading.textContent = opts.title
  titleCard.appendChild(heading)
  card.appendChild(titleCard)

  const authorEl = document.createElement('div')
  authorEl.className = 'digital_entity_author'
  authorEl.textContent = opts.author
  card.appendChild(authorEl)

  if (opts.thumbnailUrl) {
    const img = document.createElement('img')
    img.src = opts.thumbnailUrl
    card.appendChild(img)
  }

  return card
}

function setupKindlePage(books: Parameters<typeof createBookElement>[0][]): void {
  document.body.innerHTML = ''
  const list = document.createElement('div')
  list.id = 'CONTENT_LIST'
  for (const book of books) {
    list.appendChild(createBookElement(book))
  }
  document.body.appendChild(list)
}

// --- テスト ---

describe('kindle', () => {
  let kindleModule: typeof import('../kindle.js')

  beforeEach(async () => {
    vi.clearAllMocks()
    mockStorage.clear()
    document.body.innerHTML = ''
    // jsdom environment の場合 location をモック
    Object.defineProperty(window, 'location', {
      value: {
        href: 'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/',
      },
      writable: true,
    })
    kindleModule = await import('../kindle.js')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('isKindleContentPage', () => {
    it('購入履歴ページの URL で true を返す', () => {
      window.location.href =
        'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/'
      expect(kindleModule.isKindleContentPage()).toBe(true)
    })

    it('contentlist/booksAll 配下の別ソートでも true を返す', () => {
      window.location.href =
        'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/titleAsc/'
      expect(kindleModule.isKindleContentPage()).toBe(true)
    })

    it('contentlist 配下でも booksAll 以外は false を返す', () => {
      window.location.href =
        'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/pdocs/dateDsc/'
      expect(kindleModule.isKindleContentPage()).toBe(false)
    })

    it('Amazon のトップページで false を返す', () => {
      window.location.href = 'https://www.amazon.co.jp/'
      expect(kindleModule.isKindleContentPage()).toBe(false)
    })

    it('他のサイトで false を返す', () => {
      window.location.href = 'https://example.com/'
      expect(kindleModule.isKindleContentPage()).toBe(false)
    })
  })

  describe('scrapeKindleBooks', () => {
    it('DOM から書籍データを抽出し、ASIN から書影 URL を組み立てる', () => {
      setupKindlePage([
        {
          title: 'ワンピース 107巻',
          author: '尾田栄一郎',
          asin: 'B0CXXXXXX1',
          // DOM 上の img.src は敢えて別ドメインに設定し、
          // 実装が DOM img に依存していないことを確認する
          thumbnailUrl: 'https://example.com/lazy-placeholder.png',
        },
        {
          title: '鬼滅の刃（23）',
          author: '吾峠呼世晴',
          asin: 'B0CXXXXXX2',
        },
      ])

      const result = kindleModule.scrapeKindleBooks()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        title: 'ワンピース 107巻',
        author: '尾田栄一郎',
        thumbnailUrl: 'https://m.media-amazon.com/images/P/B0CXXXXXX1.jpg',
        storeProductId: 'B0CXXXXXX1',
      })
      expect(result[1]).toEqual({
        title: '鬼滅の刃（23）',
        author: '吾峠呼世晴',
        thumbnailUrl: 'https://m.media-amazon.com/images/P/B0CXXXXXX2.jpg',
        storeProductId: 'B0CXXXXXX2',
      })
    })

    it('ASIN が 10 桁の英数字形式でない場合は thumbnailUrl と storeProductId を undefined にする', () => {
      document.body.innerHTML = ''
      const list = document.createElement('div')
      list.id = 'CONTENT_LIST'
      const card = document.createElement('div')
      const titleCard = document.createElement('div')
      // content-title- で始まるが、ASIN 部分が 10 桁形式を満たさない
      titleCard.id = 'content-title-invalid'
      titleCard.className = 'digital_entity_title'
      const heading = document.createElement('div')
      heading.setAttribute('role', 'heading')
      heading.textContent = 'テスト 1巻'
      titleCard.appendChild(heading)
      card.appendChild(titleCard)
      const authorEl = document.createElement('div')
      authorEl.className = 'digital_entity_author'
      authorEl.textContent = 'テスト作者'
      card.appendChild(authorEl)
      list.appendChild(card)
      document.body.appendChild(list)

      const result = kindleModule.scrapeKindleBooks()
      expect(result).toHaveLength(1)
      expect(result[0]?.thumbnailUrl).toBeUndefined()
      expect(result[0]?.storeProductId).toBeUndefined()
    })

    it('書籍要素がない場合は空配列を返す', () => {
      document.body.innerHTML = '<div>empty page</div>'
      const result = kindleModule.scrapeKindleBooks()
      expect(result).toEqual([])
    })

    it('タイトルが空の要素はスキップする', () => {
      setupKindlePage([
        { title: '', author: 'テスト作者' },
        { title: 'テスト 1巻', author: 'テスト作者' },
      ])

      const result = kindleModule.scrapeKindleBooks()
      expect(result).toHaveLength(1)
    })

    it('著者が空の要素はスキップする', () => {
      setupKindlePage([
        { title: 'テスト 1巻', author: '' },
        { title: 'テスト 2巻', author: 'テスト作者' },
      ])

      const result = kindleModule.scrapeKindleBooks()
      expect(result).toHaveLength(1)
    })
  })

  describe('waitForElement', () => {
    it('既に存在する要素は即座に resolve する', async () => {
      document.body.innerHTML = '<div id="CONTENT_LIST"></div>'
      const el = await kindleModule.waitForElement('#CONTENT_LIST', 1000)
      expect(el).not.toBeNull()
    })

    it('タイムアウトした場合 null を返す', async () => {
      document.body.innerHTML = ''
      const el = await kindleModule.waitForElement('#CONTENT_LIST', 100)
      expect(el).toBeNull()
    })
  })

  describe('main', () => {
    it('書籍を取得して sendScrapedBooks を呼ぶ', async () => {
      const successResponse: SendScrapedBooksResponse = {
        success: true,
        data: { savedCount: 1, duplicateCount: 0, duplicates: [] },
      }
      mockSendMessage.mockResolvedValue(successResponse)

      setupKindlePage([
        {
          title: 'ワンピース 107巻',
          author: '尾田栄一郎',
          asin: 'B0TESTXXX1',
        },
      ])

      await kindleModule.main()

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'SEND_SCRAPED_BOOKS',
        books: [
          {
            title: 'ワンピース',
            author: '尾田栄一郎',
            volumeNumber: 107,
            store: 'kindle',
            thumbnailUrl: 'https://m.media-amazon.com/images/P/B0TESTXXX1.jpg',
            storeProductId: 'B0TESTXXX1',
            isAdult: false,
          },
        ],
      })
    })

    it('購入履歴ページでない場合は何もしない', async () => {
      window.location.href = 'https://www.amazon.co.jp/'
      setupKindlePage([{ title: 'テスト 1巻', author: 'テスト作者' }])

      await kindleModule.main()

      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('書籍が 0 件の場合は送信しない', async () => {
      // タイトル要素は存在するが、カード全体（著者要素を含む祖先）が見つからないケース。
      // waitForElement がマッチする → scrapeKindleBooks が空配列を返す → 早期 return
      const orphan = document.createElement('div')
      orphan.id = 'content-title-B000000000'
      orphan.className = 'digital_entity_title'
      // 著者要素なし → findBookCardRoot が null → スキップ
      document.body.appendChild(orphan)

      await kindleModule.main()

      expect(mockSendMessage).not.toHaveBeenCalled()
    })
  })

  describe('main: ページネーション', () => {
    function addPageLink(pageNum: number): void {
      const link = document.createElement('a')
      link.textContent = String(pageNum)
      link.href = `?pageNumber=${pageNum}`
      document.body.appendChild(link)
    }

    function setupSinglePage(): void {
      setupKindlePage([{ title: 'ワンピース 1巻', author: '尾田栄一郎' }])
    }

    it('単一ページ (次ページリンクなし) → 即座に送信', async () => {
      mockSendMessage.mockResolvedValue({
        success: true,
        data: { savedCount: 1, duplicateCount: 0, duplicates: [] },
      } satisfies SendScrapedBooksResponse)
      setupSinglePage()
      // ページ 2 リンクなし

      const navigateSpy = vi
        .spyOn(kindleModule._internals, 'navigateTo')
        .mockImplementation(() => {})
      await kindleModule.main()

      expect(mockSendMessage).toHaveBeenCalledOnce()
      expect(navigateSpy).not.toHaveBeenCalled()
      // セッションは送信後にクリアされる
      expect(mockStorage.has('bookhub_scrape_session_v1')).toBe(false)
      navigateSpy.mockRestore()
    })

    it('複数ページ 1 ページ目 → 送信せずセッション保存し次ページへ navigate', async () => {
      setupSinglePage()
      addPageLink(2)
      const navigateSpy = vi
        .spyOn(kindleModule._internals, 'navigateTo')
        .mockImplementation(() => {})

      await kindleModule.main()

      // 送信は呼ばれない
      expect(mockSendMessage).not.toHaveBeenCalled()
      // ナビゲーションが起きる
      expect(navigateSpy).toHaveBeenCalledOnce()
      const navigatedTo = navigateSpy.mock.calls[0]?.[0] as string
      expect(navigatedTo).toContain('pageNumber=2')
      // セッションが保存される
      const session = mockStorage.get('bookhub_scrape_session_v1') as
        | Record<string, unknown>
        | undefined
      expect(session).toBeDefined()
      expect(session?.lastPageScraped).toBe(1)
      navigateSpy.mockRestore()
    })

    it('複数ページ 2 ページ目 (既存セッションあり、次ページなし) → 累積送信', async () => {
      // 既存セッションを準備
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: Date.now(),
        originalUrl:
          'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/',
        lastPageScraped: 1,
        books: [
          {
            title: 'ワンピース',
            author: '尾田栄一郎',
            volumeNumber: 1,
            store: 'kindle',
            isAdult: false,
          },
        ],
        seenKeys: ['ワンピース|尾田栄一郎|1'],
      })
      window.location.href =
        'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/?pageNumber=2'
      setupKindlePage([{ title: 'ワンピース 2巻', author: '尾田栄一郎' }])
      mockSendMessage.mockResolvedValue({
        success: true,
        data: { savedCount: 2, duplicateCount: 0, duplicates: [] },
      } satisfies SendScrapedBooksResponse)
      const navigateSpy = vi
        .spyOn(kindleModule._internals, 'navigateTo')
        .mockImplementation(() => {})

      await kindleModule.main()

      expect(mockSendMessage).toHaveBeenCalledOnce()
      const sentMessage = mockSendMessage.mock.calls[0]?.[0] as { books: unknown[] }
      // 2 件の累積 (ページ 1 の 1 巻 + ページ 2 の 2 巻)
      expect(sentMessage.books).toHaveLength(2)
      expect(navigateSpy).not.toHaveBeenCalled()
      // セッションがクリアされる
      expect(mockStorage.has('bookhub_scrape_session_v1')).toBe(false)
      navigateSpy.mockRestore()
    })

    it('ステイルセッション (6 分前) → 破棄して新規開始', async () => {
      const sixMinutesAgo = Date.now() - 6 * 60 * 1000
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: sixMinutesAgo,
        originalUrl:
          'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/',
        lastPageScraped: 5,
        books: [
          {
            title: 'oldbook',
            author: 'old',
            store: 'kindle',
            isAdult: false,
          },
        ],
        seenKeys: ['oldbook|old|null'],
      })
      setupSinglePage()
      mockSendMessage.mockResolvedValue({
        success: true,
        data: { savedCount: 1, duplicateCount: 0, duplicates: [] },
      } satisfies SendScrapedBooksResponse)
      const navigateSpy = vi
        .spyOn(kindleModule._internals, 'navigateTo')
        .mockImplementation(() => {})

      await kindleModule.main()

      // 古いセッションは破棄され、新規 1 件のみ送信される
      const sentMessage = mockSendMessage.mock.calls[0]?.[0] as { books: { title: string }[] }
      expect(sentMessage.books).toHaveLength(1)
      expect(sentMessage.books[0]?.title).toBe('ワンピース')
      navigateSpy.mockRestore()
    })

    it('originalUrl が異なるセッション → 破棄して新規開始', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: Date.now(),
        originalUrl:
          'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/titleAsc/',
        lastPageScraped: 3,
        books: [
          {
            title: 'oldbook',
            author: 'old',
            store: 'kindle',
            isAdult: false,
          },
        ],
        seenKeys: ['oldbook|old|null'],
      })
      setupSinglePage()
      mockSendMessage.mockResolvedValue({
        success: true,
        data: { savedCount: 1, duplicateCount: 0, duplicates: [] },
      } satisfies SendScrapedBooksResponse)
      const navigateSpy = vi
        .spyOn(kindleModule._internals, 'navigateTo')
        .mockImplementation(() => {})

      await kindleModule.main()

      const sentMessage = mockSendMessage.mock.calls[0]?.[0] as { books: { title: string }[] }
      expect(sentMessage.books).toHaveLength(1)
      expect(sentMessage.books[0]?.title).toBe('ワンピース')
      navigateSpy.mockRestore()
    })

    it('AUTH_ERROR 時はセッションを保持する', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: Date.now(),
        originalUrl:
          'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/',
        lastPageScraped: 1,
        books: [
          {
            title: 'ワンピース',
            author: '尾田栄一郎',
            volumeNumber: 1,
            store: 'kindle',
            isAdult: false,
          },
        ],
        seenKeys: ['ワンピース|尾田栄一郎|1'],
      })
      window.location.href =
        'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/?pageNumber=2'
      setupKindlePage([{ title: 'ワンピース 2巻', author: '尾田栄一郎' }])
      mockSendMessage.mockResolvedValue({
        success: false,
        error: '未認証',
        code: 'AUTH_ERROR',
      } satisfies SendScrapedBooksResponse)
      const navigateSpy = vi
        .spyOn(kindleModule._internals, 'navigateTo')
        .mockImplementation(() => {})

      await kindleModule.main()

      expect(mockSendMessage).toHaveBeenCalled()
      // セッションは保持される (再ログイン後に再送可能)
      expect(mockStorage.has('bookhub_scrape_session_v1')).toBe(true)
      navigateSpy.mockRestore()
    })

    it('同じページの再スクレイプはスキップする (リロード対策)', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: Date.now(),
        originalUrl:
          'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/',
        lastPageScraped: 2,
        books: [],
        seenKeys: [],
      })
      window.location.href =
        'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/?pageNumber=2'
      setupSinglePage()
      const navigateSpy = vi
        .spyOn(kindleModule._internals, 'navigateTo')
        .mockImplementation(() => {})

      await kindleModule.main()

      expect(mockSendMessage).not.toHaveBeenCalled()
      expect(navigateSpy).not.toHaveBeenCalled()
      navigateSpy.mockRestore()
    })

    it('ページジャンプ検知 (lastScraped=3 → currentPage=5) → セッション破棄して新規開始', async () => {
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: Date.now(),
        originalUrl:
          'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/',
        lastPageScraped: 3,
        books: [
          {
            title: 'old-book',
            author: 'old',
            store: 'kindle',
            isAdult: false,
          },
        ],
        seenKeys: ['old-book|old|null'],
      })
      // ユーザーが手動で page=5 へジャンプ (lastScraped+1=4 ではない)
      window.location.href =
        'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/?pageNumber=5'
      setupKindlePage([{ title: '新規 1巻', author: '新規作者' }])
      mockSendMessage.mockResolvedValue({
        success: true,
        data: { savedCount: 1, duplicateCount: 0, duplicates: [] },
      } satisfies SendScrapedBooksResponse)
      const navigateSpy = vi
        .spyOn(kindleModule._internals, 'navigateTo')
        .mockImplementation(() => {})

      await kindleModule.main()

      // ジャンプ検知で古いセッションは破棄され、現在ページから新規開始
      // (page 5 の書籍 1 件のみが累積される)
      const sentMessage = mockSendMessage.mock.calls[0]?.[0] as { books: { title: string }[] }
      expect(sentMessage.books).toHaveLength(1)
      expect(sentMessage.books[0]?.title).toBe('新規')
      navigateSpy.mockRestore()
    })

    it('セーフティ上限到達時は次ページへ遷移せず送信し、セッションを保存する', async () => {
      // 既存セッションに 499 冊蓄積済み (1 件追加で 500 件 = 上限)
      const existingBooks = Array.from({ length: 499 }, (_, i) => ({
        title: `book-${i}`,
        author: 'author',
        store: 'kindle',
        isAdult: false,
      }))
      const existingSeenKeys = existingBooks.map((b) => `${b.title}|${b.author}|null`)
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: Date.now(),
        originalUrl:
          'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/',
        lastPageScraped: 19,
        books: existingBooks,
        seenKeys: existingSeenKeys,
      })
      window.location.href =
        'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/?pageNumber=20'
      // 現在のページに 1 件追加 → 計 500 件で上限到達
      setupKindlePage([{ title: 'last 1巻', author: '作者' }])
      // 次ページリンクも存在するが、上限で強制送信されるはず
      const nextLink = document.createElement('a')
      nextLink.textContent = '21'
      document.body.appendChild(nextLink)

      mockSendMessage.mockResolvedValue({
        success: true,
        data: { savedCount: 500, duplicateCount: 0, duplicates: [] },
      } satisfies SendScrapedBooksResponse)
      const navigateSpy = vi
        .spyOn(kindleModule._internals, 'navigateTo')
        .mockImplementation(() => {})

      await kindleModule.main()

      // 送信は呼ばれる、navigate は呼ばれない
      expect(mockSendMessage).toHaveBeenCalledOnce()
      const sentMessage = mockSendMessage.mock.calls[0]?.[0] as { books: unknown[] }
      expect(sentMessage.books).toHaveLength(500)
      expect(navigateSpy).not.toHaveBeenCalled()
      // 成功時はセッションがクリアされる (sendAndClear 経由)
      expect(mockStorage.has('bookhub_scrape_session_v1')).toBe(false)
      navigateSpy.mockRestore()
    })

    it('セーフティ上限到達 + AUTH_ERROR の場合、セッション保存して保持する', async () => {
      // 499 件蓄積 → 1 件追加で上限
      const existingBooks = Array.from({ length: 499 }, (_, i) => ({
        title: `book-${i}`,
        author: 'author',
        store: 'kindle',
        isAdult: false,
      }))
      const existingSeenKeys = existingBooks.map((b) => `${b.title}|${b.author}|null`)
      mockStorage.set('bookhub_scrape_session_v1', {
        startedAt: Date.now(),
        originalUrl:
          'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/',
        lastPageScraped: 19,
        books: existingBooks,
        seenKeys: existingSeenKeys,
      })
      window.location.href =
        'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/dateDsc/?pageNumber=20'
      setupKindlePage([{ title: 'last 1巻', author: '作者' }])
      mockSendMessage.mockResolvedValue({
        success: false,
        error: '未認証',
        code: 'AUTH_ERROR',
      } satisfies SendScrapedBooksResponse)
      const navigateSpy = vi
        .spyOn(kindleModule._internals, 'navigateTo')
        .mockImplementation(() => {})

      await kindleModule.main()

      // セッションは保持され、最新の累積 500 件を含む状態
      const session = mockStorage.get('bookhub_scrape_session_v1') as {
        books: unknown[]
        lastPageScraped: number
      }
      expect(session).toBeDefined()
      expect(session.books).toHaveLength(500)
      expect(session.lastPageScraped).toBe(20)
      navigateSpy.mockRestore()
    })
  })
})
