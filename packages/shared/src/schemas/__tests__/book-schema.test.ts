import { storeSchema, scrapeBookSchema, scrapePayloadSchema } from '../book-schema'

const validBook = {
  title: 'ワンピース',
  author: '尾田栄一郎',
  store: 'kindle' as const,
}

const fullBook = {
  ...validBook,
  volumeNumber: 107,
  thumbnailUrl: 'https://example.com/cover.jpg',
  isbn: '9784088835099',
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
        thumbnailUrl: 'https://example.com/img.jpg',
      })
      expect(result.success).toBe(true)
    })

    it('http URL を拒否する', () => {
      const result = scrapeBookSchema.safeParse({
        ...validBook,
        thumbnailUrl: 'http://example.com/img.jpg',
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
