// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SendScrapedBooksResponse } from '../../types/messages.js'

// --- chrome API モック ---
const mockSendMessage = vi.fn()

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: mockSendMessage,
  },
})

// --- DOM ヘルパー ---

function createBookElement(opts: {
  title: string
  author: string
  thumbnailUrl?: string
}): HTMLElement {
  const container = document.createElement('div')
  container.setAttribute('data-testid', 'content-item')
  container.classList.add('ContentItem_container__heading')

  const titleEl = document.createElement('span')
  titleEl.classList.add('ContentItem_title__text')
  titleEl.textContent = opts.title
  container.appendChild(titleEl)

  const authorEl = document.createElement('span')
  authorEl.classList.add('ContentItem_author__text')
  authorEl.textContent = opts.author
  container.appendChild(authorEl)

  if (opts.thumbnailUrl) {
    const img = document.createElement('img')
    img.classList.add('ContentItem_cover__image')
    img.src = opts.thumbnailUrl
    container.appendChild(img)
  }

  return container
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

    it('contentlist 配下の別パスでも true を返す', () => {
      window.location.href =
        'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/pdocs/dateDsc/'
      expect(kindleModule.isKindleContentPage()).toBe(true)
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
    it('DOM から書籍データを抽出する', () => {
      setupKindlePage([
        {
          title: 'ワンピース 107巻',
          author: '尾田栄一郎',
          thumbnailUrl: 'https://m.media-amazon.com/images/I/test.jpg',
        },
        {
          title: '鬼滅の刃（23）',
          author: '吾峠呼世晴',
        },
      ])

      const result = kindleModule.scrapeKindleBooks()

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        title: 'ワンピース 107巻',
        author: '尾田栄一郎',
        thumbnailUrl: 'https://m.media-amazon.com/images/I/test.jpg',
      })
      expect(result[1]).toEqual({
        title: '鬼滅の刃（23）',
        author: '吾峠呼世晴',
        thumbnailUrl: undefined,
      })
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
          thumbnailUrl: 'https://m.media-amazon.com/images/I/test.jpg',
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
            thumbnailUrl: 'https://m.media-amazon.com/images/I/test.jpg',
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
      // 書籍アイテムなしだが要素自体は存在する状態を作る
      // main() 内の waitForElement がタイムアウトして早期 return する
      // scrapeKindleBooks が空配列を返すケースは scrapeKindleBooks テストでカバー済み
      const container = document.createElement('div')
      container.classList.add('ContentItem_container__heading')
      // タイトル・著者なし → scrapeKindleBooks がスキップ → 0 件
      document.body.appendChild(container)

      await kindleModule.main()

      expect(mockSendMessage).not.toHaveBeenCalled()
    })
  })
})
