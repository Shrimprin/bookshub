import { storeSchema, scrapeBookSchema, scrapePayloadSchema } from '../book-schema'

const validBook = {
  title: 'ワンピース',
  author: '尾田栄一郎',
  store: 'kindle' as const,
}

const fullBook = {
  ...validBook,
  volumeNumber: 107,
  thumbnailUrl: 'https://m.media-amazon.com/images/I/cover.jpg',
  isbn: '9784088835099',
  isAdult: false,
}

// --- storeSchema ---

describe('storeSchema', () => {
  it.each(['kindle', 'dmm', 'other'])('有効なストア "%s" を受け入れる', (store) => {
    expect(storeSchema.safeParse(store).success).toBe(true)
  })

  it.each(['kobo', 'bookwalker', '', 123, null, undefined])('無効な値 %j を拒否する', (value) => {
    expect(storeSchema.safeParse(value).success).toBe(false)
  })
})

// --- scrapeBookSchema ---

describe('scrapeBookSchema', () => {
  describe('正常系', () => {
    it('必須フィールドのみで有効', () => {
      const result = scrapeBookSchema.safeParse(validBook)
      expect(result.success).toBe(true)
    })

    it('全フィールド指定で有効', () => {
      const result = scrapeBookSchema.safeParse(fullBook)
      expect(result.success).toBe(true)
    })
  })

  describe('title', () => {
    it('1文字は有効（min 境界）', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, title: 'A' })
      expect(result.success).toBe(true)
    })

    it('500文字は有効（max 境界）', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, title: 'A'.repeat(500) })
      expect(result.success).toBe(true)
    })

    it('空文字を拒否する', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, title: '' })
      expect(result.success).toBe(false)
    })

    it('501文字を拒否する', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, title: 'A'.repeat(501) })
      expect(result.success).toBe(false)
    })
  })

  describe('author', () => {
    it('1文字は有効（min 境界）', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, author: 'A' })
      expect(result.success).toBe(true)
    })

    it('200文字は有効（max 境界）', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, author: 'A'.repeat(200) })
      expect(result.success).toBe(true)
    })

    it('空文字を拒否する', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, author: '' })
      expect(result.success).toBe(false)
    })

    it('201文字を拒否する', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, author: 'A'.repeat(201) })
      expect(result.success).toBe(false)
    })
  })

  describe('volumeNumber', () => {
    it('正の整数を受け入れる', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, volumeNumber: 1 })
      expect(result.success).toBe(true)
    })

    it('9999 を受け入れる（max 境界）', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, volumeNumber: 9999 })
      expect(result.success).toBe(true)
    })

    it('0 を拒否する', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, volumeNumber: 0 })
      expect(result.success).toBe(false)
    })

    it('負数を拒否する', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, volumeNumber: -1 })
      expect(result.success).toBe(false)
    })

    it('小数を拒否する', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, volumeNumber: 1.5 })
      expect(result.success).toBe(false)
    })

    it('10000 を拒否する（max 超過）', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, volumeNumber: 10000 })
      expect(result.success).toBe(false)
    })
  })

  describe('thumbnailUrl', () => {
    it('https URL を受け入れる', () => {
      const result = scrapeBookSchema.safeParse({
        ...validBook,
        thumbnailUrl: 'https://pics.dmm.co.jp/img.jpg',
      })
      expect(result.success).toBe(true)
    })

    it('http URL を拒否する', () => {
      const result = scrapeBookSchema.safeParse({
        ...validBook,
        thumbnailUrl: 'http://m.media-amazon.com/img.jpg',
      })
      expect(result.success).toBe(false)
    })

    it('不正な URL を拒否する', () => {
      const result = scrapeBookSchema.safeParse({
        ...validBook,
        thumbnailUrl: 'not-a-url',
      })
      expect(result.success).toBe(false)
    })

    it('許可されていないドメインを拒否する', () => {
      const result = scrapeBookSchema.safeParse({
        ...validBook,
        thumbnailUrl: 'https://evil.example.com/tracking.gif',
      })
      expect(result.success).toBe(false)
    })

    it('Amazon ドメインを受け入れる', () => {
      const result = scrapeBookSchema.safeParse({
        ...validBook,
        thumbnailUrl: 'https://m.media-amazon.com/images/I/img.jpg',
      })
      expect(result.success).toBe(true)
    })
  })

  describe('isbn', () => {
    it('10桁の ISBN を受け入れる', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, isbn: '1234567890' })
      expect(result.success).toBe(true)
    })

    it('13桁の ISBN を受け入れる', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, isbn: '1234567890123' })
      expect(result.success).toBe(true)
    })

    it('9桁を拒否する', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, isbn: '123456789' })
      expect(result.success).toBe(false)
    })

    it('11桁を拒否する', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, isbn: '12345678901' })
      expect(result.success).toBe(false)
    })

    it('文字を含む ISBN を拒否する', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, isbn: '123456789X' })
      expect(result.success).toBe(false)
    })
  })

  describe('storeProductId', () => {
    it('省略可能（undefined）', () => {
      const result = scrapeBookSchema.safeParse(validBook)
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.storeProductId).toBeUndefined()
    })

    it('1文字を受け入れる（min 境界）', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, storeProductId: 'A' })
      expect(result.success).toBe(true)
    })

    it('64文字を受け入れる（max 境界）', () => {
      const result = scrapeBookSchema.safeParse({
        ...validBook,
        storeProductId: 'A'.repeat(64),
      })
      expect(result.success).toBe(true)
    })

    it('65文字を拒否する（max 超過）', () => {
      const result = scrapeBookSchema.safeParse({
        ...validBook,
        storeProductId: 'A'.repeat(65),
      })
      expect(result.success).toBe(false)
    })

    it('空文字を拒否する', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, storeProductId: '' })
      expect(result.success).toBe(false)
    })

    it('ASIN (10文字英数) を受け入れる', () => {
      const result = scrapeBookSchema.safeParse({
        ...validBook,
        storeProductId: 'B0ABCDEFGH',
      })
      expect(result.success).toBe(true)
    })

    it.each(['a b', 'id\nwith\nnewline', 'id\twith\ttab', 'id<script>', '絵文字🎉'])(
      '制御文字や許可外文字を含む %j を拒否する',
      (value) => {
        const result = scrapeBookSchema.safeParse({ ...validBook, storeProductId: value })
        expect(result.success).toBe(false)
      },
    )
  })

  describe('isAdult', () => {
    it('true を受け入れる', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, isAdult: true })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.isAdult).toBe(true)
    })

    it('false を受け入れる', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, isAdult: false })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.isAdult).toBe(false)
    })

    it('省略時は false がデフォルト', () => {
      const result = scrapeBookSchema.safeParse(validBook)
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.isAdult).toBe(false)
    })

    it('文字列を拒否する', () => {
      const result = scrapeBookSchema.safeParse({ ...validBook, isAdult: 'true' })
      expect(result.success).toBe(false)
    })
  })

  describe('必須フィールド', () => {
    it('title 欠落を拒否する', () => {
      const { title: _, ...noTitle } = validBook
      expect(scrapeBookSchema.safeParse(noTitle).success).toBe(false)
    })

    it('author 欠落を拒否する', () => {
      const { author: _, ...noAuthor } = validBook
      expect(scrapeBookSchema.safeParse(noAuthor).success).toBe(false)
    })

    it('store 欠落を拒否する', () => {
      const { store: _, ...noStore } = validBook
      expect(scrapeBookSchema.safeParse(noStore).success).toBe(false)
    })
  })
})

// --- scrapePayloadSchema ---

describe('scrapePayloadSchema', () => {
  it('1件の配列を受け入れる（min 境界）', () => {
    const result = scrapePayloadSchema.safeParse({ books: [validBook] })
    expect(result.success).toBe(true)
  })

  it('500件の配列を受け入れる（max 境界）', () => {
    const books = Array.from({ length: 500 }, () => validBook)
    const result = scrapePayloadSchema.safeParse({ books })
    expect(result.success).toBe(true)
  })

  it('空配列を拒否する', () => {
    const result = scrapePayloadSchema.safeParse({ books: [] })
    expect(result.success).toBe(false)
  })

  it('501件の配列を拒否する', () => {
    const books = Array.from({ length: 501 }, () => validBook)
    const result = scrapePayloadSchema.safeParse({ books })
    expect(result.success).toBe(false)
  })

  it('不正な book が含まれる場合を拒否する', () => {
    const result = scrapePayloadSchema.safeParse({
      books: [validBook, { title: '', author: '', store: 'invalid' }],
    })
    expect(result.success).toBe(false)
  })

  it('books フィールド欠落を拒否する', () => {
    const result = scrapePayloadSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
