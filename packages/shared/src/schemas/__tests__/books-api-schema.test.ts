import {
  userBookIdSchema,
  seriesIdSchema,
  registerBookSchema,
  updateUserBookSchema,
  getBooksQuerySchema,
  bookWithStoreSchema,
  getBooksResponseSchema,
  registerBookResponseSchema,
} from '../books-api-schema'

// --- テスト用データ ---

const validRegisterBook = {
  title: 'ワンピース',
  author: '尾田栄一郎',
  store: 'kindle' as const,
}

const fullRegisterBook = {
  ...validRegisterBook,
  volumeNumber: 107,
  thumbnailUrl: 'https://m.media-amazon.com/images/I/cover.jpg',
  isbn: '9784088835099',
  publishedAt: '2024-03-04',
  isAdult: false,
}

const validBookWithStore = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'ワンピース',
  author: '尾田栄一郎',
  volumeNumber: 107,
  thumbnailUrl: 'https://m.media-amazon.com/images/I/cover.jpg',
  isbn: '9784088835099',
  publishedAt: '2024-03-04',
  isAdult: false,
  createdAt: '2024-03-04T00:00:00.000Z',
  userBookId: '660e8400-e29b-41d4-a716-446655440000',
  store: 'kindle' as const,
  storeProductId: 'B0ABCDEFGH',
  userBookCreatedAt: '2024-03-04T00:00:00.000Z',
}

// --- userBookIdSchema ---

describe('userBookIdSchema', () => {
  it('有効な UUID を受け入れる', () => {
    const result = userBookIdSchema.safeParse('550e8400-e29b-41d4-a716-446655440000')
    expect(result.success).toBe(true)
  })

  it.each(['not-a-uuid', '', '123', '550e8400-e29b-41d4-a716', null, undefined, 123])(
    '無効な値 %j を拒否する',
    (value) => {
      expect(userBookIdSchema.safeParse(value).success).toBe(false)
    },
  )
})

// --- seriesIdSchema ---

describe('seriesIdSchema', () => {
  it('有効な UUID を受け入れる', () => {
    const result = seriesIdSchema.safeParse('11111111-1111-1111-1111-111111111111')
    expect(result.success).toBe(true)
  })

  it.each(['not-a-uuid', '', '123', '11111111-1111-1111-1111', null, undefined, 123])(
    '無効な値 %j を拒否する',
    (value) => {
      expect(seriesIdSchema.safeParse(value).success).toBe(false)
    },
  )
})

// --- registerBookSchema ---

describe('registerBookSchema', () => {
  describe('正常系', () => {
    it('必須フィールドのみで有効', () => {
      const result = registerBookSchema.safeParse(validRegisterBook)
      expect(result.success).toBe(true)
    })

    it('全フィールド指定で有効', () => {
      const result = registerBookSchema.safeParse(fullRegisterBook)
      expect(result.success).toBe(true)
    })

    it('isAdult 省略時は false がデフォルト', () => {
      const result = registerBookSchema.safeParse(validRegisterBook)
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.isAdult).toBe(false)
    })
  })

  describe('title', () => {
    it('1文字は有効（min 境界）', () => {
      expect(registerBookSchema.safeParse({ ...validRegisterBook, title: 'A' }).success).toBe(true)
    })

    it('500文字は有効（max 境界）', () => {
      expect(
        registerBookSchema.safeParse({ ...validRegisterBook, title: 'A'.repeat(500) }).success,
      ).toBe(true)
    })

    it('空文字を拒否する', () => {
      expect(registerBookSchema.safeParse({ ...validRegisterBook, title: '' }).success).toBe(false)
    })

    it('501文字を拒否する', () => {
      expect(
        registerBookSchema.safeParse({ ...validRegisterBook, title: 'A'.repeat(501) }).success,
      ).toBe(false)
    })
  })

  describe('author', () => {
    it('1文字は有効（min 境界）', () => {
      expect(registerBookSchema.safeParse({ ...validRegisterBook, author: 'A' }).success).toBe(true)
    })

    it('200文字は有効（max 境界）', () => {
      expect(
        registerBookSchema.safeParse({ ...validRegisterBook, author: 'A'.repeat(200) }).success,
      ).toBe(true)
    })

    it('空文字を拒否する', () => {
      expect(registerBookSchema.safeParse({ ...validRegisterBook, author: '' }).success).toBe(false)
    })

    it('201文字を拒否する', () => {
      expect(
        registerBookSchema.safeParse({ ...validRegisterBook, author: 'A'.repeat(201) }).success,
      ).toBe(false)
    })
  })

  describe('volumeNumber', () => {
    it('正の整数を受け入れる', () => {
      expect(registerBookSchema.safeParse({ ...validRegisterBook, volumeNumber: 1 }).success).toBe(
        true,
      )
    })

    it('9999 を受け入れる（max 境界）', () => {
      expect(
        registerBookSchema.safeParse({ ...validRegisterBook, volumeNumber: 9999 }).success,
      ).toBe(true)
    })

    it('0 を拒否する', () => {
      expect(registerBookSchema.safeParse({ ...validRegisterBook, volumeNumber: 0 }).success).toBe(
        false,
      )
    })

    it('10000 を拒否する（max 超過）', () => {
      expect(
        registerBookSchema.safeParse({ ...validRegisterBook, volumeNumber: 10000 }).success,
      ).toBe(false)
    })

    it('小数を拒否する', () => {
      expect(
        registerBookSchema.safeParse({ ...validRegisterBook, volumeNumber: 1.5 }).success,
      ).toBe(false)
    })
  })

  describe('thumbnailUrl', () => {
    it('https URL を受け入れる', () => {
      expect(
        registerBookSchema.safeParse({
          ...validRegisterBook,
          thumbnailUrl: 'https://m.media-amazon.com/images/I/img.jpg',
        }).success,
      ).toBe(true)
    })

    it('http URL を拒否する', () => {
      expect(
        registerBookSchema.safeParse({
          ...validRegisterBook,
          thumbnailUrl: 'http://m.media-amazon.com/img.jpg',
        }).success,
      ).toBe(false)
    })

    it('許可されていないドメインを拒否する', () => {
      expect(
        registerBookSchema.safeParse({
          ...validRegisterBook,
          thumbnailUrl: 'https://evil.example.com/tracking.gif',
        }).success,
      ).toBe(false)
    })

    it('DMM ドメインを受け入れる', () => {
      expect(
        registerBookSchema.safeParse({
          ...validRegisterBook,
          thumbnailUrl: 'https://pics.dmm.co.jp/mono/movie/img.jpg',
        }).success,
      ).toBe(true)
    })
  })

  describe('isbn', () => {
    it('10桁の ISBN を受け入れる', () => {
      expect(
        registerBookSchema.safeParse({ ...validRegisterBook, isbn: '1234567890' }).success,
      ).toBe(true)
    })

    it('13桁の ISBN を受け入れる', () => {
      expect(
        registerBookSchema.safeParse({ ...validRegisterBook, isbn: '1234567890123' }).success,
      ).toBe(true)
    })

    it('9桁を拒否する', () => {
      expect(
        registerBookSchema.safeParse({ ...validRegisterBook, isbn: '123456789' }).success,
      ).toBe(false)
    })
  })

  describe('publishedAt', () => {
    it('ISO date 文字列を受け入れる', () => {
      expect(
        registerBookSchema.safeParse({ ...validRegisterBook, publishedAt: '2024-03-04' }).success,
      ).toBe(true)
    })

    it('不正な日付を拒否する', () => {
      expect(
        registerBookSchema.safeParse({ ...validRegisterBook, publishedAt: 'not-a-date' }).success,
      ).toBe(false)
    })
  })

  describe('必須フィールド', () => {
    it('title 欠落を拒否する', () => {
      const { title: _, ...noTitle } = validRegisterBook
      expect(registerBookSchema.safeParse(noTitle).success).toBe(false)
    })

    it('author 欠落を拒否する', () => {
      const { author: _, ...noAuthor } = validRegisterBook
      expect(registerBookSchema.safeParse(noAuthor).success).toBe(false)
    })

    it('store 欠落を拒否する', () => {
      const { store: _, ...noStore } = validRegisterBook
      expect(registerBookSchema.safeParse(noStore).success).toBe(false)
    })
  })
})

// --- updateUserBookSchema ---

describe('updateUserBookSchema', () => {
  it.each(['kindle', 'dmm', 'other'])('有効なストア "%s" を受け入れる', (store) => {
    expect(updateUserBookSchema.safeParse({ store }).success).toBe(true)
  })

  it('無効なストアを拒否する', () => {
    expect(updateUserBookSchema.safeParse({ store: 'kobo' }).success).toBe(false)
  })

  it('store 欠落を拒否する', () => {
    expect(updateUserBookSchema.safeParse({}).success).toBe(false)
  })
})

// --- getBooksQuerySchema ---

describe('getBooksQuerySchema', () => {
  describe('デフォルト値', () => {
    it('パラメータなしでデフォルト値が設定される', () => {
      const result = getBooksQuerySchema.safeParse({})
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.page).toBe(1)
        expect(result.data.limit).toBe(20)
        expect(result.data.q).toBeUndefined()
        expect(result.data.store).toBeUndefined()
        expect(result.data.isAdult).toBeUndefined()
      }
    })
  })

  describe('q パラメータ', () => {
    it('2文字以上を受け入れる', () => {
      const result = getBooksQuerySchema.safeParse({ q: 'ワン' })
      expect(result.success).toBe(true)
    })

    it('1文字を拒否する（min(2) 制約）', () => {
      const result = getBooksQuerySchema.safeParse({ q: 'A' })
      expect(result.success).toBe(false)
    })

    it('201文字以上を拒否する（max(200) 制約）', () => {
      const result = getBooksQuerySchema.safeParse({ q: 'あ'.repeat(201) })
      expect(result.success).toBe(false)
    })

    it('200文字を受け入れる（max 境界）', () => {
      const result = getBooksQuerySchema.safeParse({ q: 'あ'.repeat(200) })
      expect(result.success).toBe(true)
    })
  })

  describe('store パラメータ', () => {
    it.each(['kindle', 'dmm', 'other'])('有効なストア "%s" を受け入れる', (store) => {
      expect(getBooksQuerySchema.safeParse({ store }).success).toBe(true)
    })

    it('無効なストアを拒否する', () => {
      expect(getBooksQuerySchema.safeParse({ store: 'kobo' }).success).toBe(false)
    })
  })

  describe('isAdult パラメータ', () => {
    it('"true" を true に変換する', () => {
      const result = getBooksQuerySchema.safeParse({ isAdult: 'true' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.isAdult).toBe(true)
    })

    it('"false" を false に変換する', () => {
      const result = getBooksQuerySchema.safeParse({ isAdult: 'false' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.isAdult).toBe(false)
    })

    it('不正な値を拒否する', () => {
      expect(getBooksQuerySchema.safeParse({ isAdult: 'yes' }).success).toBe(false)
    })
  })

  describe('page パラメータ', () => {
    it('文字列を数値に変換する', () => {
      const result = getBooksQuerySchema.safeParse({ page: '3' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.page).toBe(3)
    })

    it('0 を拒否する', () => {
      expect(getBooksQuerySchema.safeParse({ page: '0' }).success).toBe(false)
    })

    it('負数を拒否する', () => {
      expect(getBooksQuerySchema.safeParse({ page: '-1' }).success).toBe(false)
    })
  })

  describe('limit パラメータ', () => {
    it('文字列を数値に変換する', () => {
      const result = getBooksQuerySchema.safeParse({ limit: '50' })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.limit).toBe(50)
    })

    it('1 を受け入れる（min 境界）', () => {
      expect(getBooksQuerySchema.safeParse({ limit: '1' }).success).toBe(true)
    })

    it('100 を受け入れる（max 境界）', () => {
      expect(getBooksQuerySchema.safeParse({ limit: '100' }).success).toBe(true)
    })

    it('0 を拒否する', () => {
      expect(getBooksQuerySchema.safeParse({ limit: '0' }).success).toBe(false)
    })

    it('101 を拒否する', () => {
      expect(getBooksQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
    })
  })
})

// --- bookWithStoreSchema ---

describe('bookWithStoreSchema', () => {
  it('有効なデータを受け入れる', () => {
    const result = bookWithStoreSchema.safeParse(validBookWithStore)
    expect(result.success).toBe(true)
  })

  it('optional フィールドが null でも有効', () => {
    const result = bookWithStoreSchema.safeParse({
      ...validBookWithStore,
      volumeNumber: null,
      thumbnailUrl: null,
      isbn: null,
      publishedAt: null,
      storeProductId: null,
    })
    expect(result.success).toBe(true)
  })

  describe('storeProductId', () => {
    it('文字列を受け入れる', () => {
      const result = bookWithStoreSchema.safeParse({
        ...validBookWithStore,
        storeProductId: 'B0ABCDEFGH',
      })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.storeProductId).toBe('B0ABCDEFGH')
    })

    it('null を受け入れる', () => {
      const result = bookWithStoreSchema.safeParse({
        ...validBookWithStore,
        storeProductId: null,
      })
      expect(result.success).toBe(true)
      if (result.success) expect(result.data.storeProductId).toBeNull()
    })

    it('storeProductId 欠落を拒否する (required nullable)', () => {
      const { storeProductId: _, ...noStoreProductId } = validBookWithStore
      expect(bookWithStoreSchema.safeParse(noStoreProductId).success).toBe(false)
    })
  })
})

// --- getBooksResponseSchema ---

describe('getBooksResponseSchema', () => {
  it('有効なレスポンスを受け入れる', () => {
    const result = getBooksResponseSchema.safeParse({
      books: [validBookWithStore],
      total: 1,
      page: 1,
      limit: 20,
    })
    expect(result.success).toBe(true)
  })

  it('空の books 配列を受け入れる', () => {
    const result = getBooksResponseSchema.safeParse({
      books: [],
      total: 0,
      page: 1,
      limit: 20,
    })
    expect(result.success).toBe(true)
  })

  it('total 欠落を拒否する', () => {
    const result = getBooksResponseSchema.safeParse({
      books: [],
      page: 1,
      limit: 20,
    })
    expect(result.success).toBe(false)
  })
})

// --- registerBookResponseSchema ---

describe('registerBookResponseSchema', () => {
  it('新規登録（alreadyOwned: false）を受け入れる', () => {
    const result = registerBookResponseSchema.safeParse({
      book: validBookWithStore,
      alreadyOwned: false,
      existingStores: [],
    })
    expect(result.success).toBe(true)
  })

  it('二度買い警告（alreadyOwned: true + existingStores）を受け入れる', () => {
    const result = registerBookResponseSchema.safeParse({
      book: validBookWithStore,
      alreadyOwned: true,
      existingStores: ['dmm'],
    })
    expect(result.success).toBe(true)
  })

  it('book 欠落を拒否する', () => {
    const result = registerBookResponseSchema.safeParse({
      alreadyOwned: false,
      existingStores: [],
    })
    expect(result.success).toBe(false)
  })
})
