import { scrapeResponseSchema } from '../scrape-response-schema'

const validResponse = {
  savedCount: 5,
  duplicateCount: 2,
  duplicates: [
    {
      title: 'ワンピース',
      volumeNumber: 107,
      existingStores: ['kindle'],
    },
    {
      title: '鬼滅の刃',
      volumeNumber: 23,
      existingStores: ['kindle', 'dmm'],
    },
  ],
}

describe('scrapeResponseSchema', () => {
  describe('正常系', () => {
    it('全フィールド指定で有効', () => {
      const result = scrapeResponseSchema.safeParse(validResponse)
      expect(result.success).toBe(true)
    })

    it('重複なしのレスポンスが有効', () => {
      const result = scrapeResponseSchema.safeParse({
        savedCount: 10,
        duplicateCount: 0,
        duplicates: [],
      })
      expect(result.success).toBe(true)
    })

    it('volumeNumber が undefined の重複エントリが有効（単巻）', () => {
      const result = scrapeResponseSchema.safeParse({
        savedCount: 1,
        duplicateCount: 1,
        duplicates: [
          {
            title: '火花',
            existingStores: ['dmm'],
          },
        ],
      })
      expect(result.success).toBe(true)
    })
  })

  describe('savedCount', () => {
    it('0 を受け入れる', () => {
      const result = scrapeResponseSchema.safeParse({
        ...validResponse,
        savedCount: 0,
      })
      expect(result.success).toBe(true)
    })

    it('負数を拒否する', () => {
      const result = scrapeResponseSchema.safeParse({
        ...validResponse,
        savedCount: -1,
      })
      expect(result.success).toBe(false)
    })

    it('小数を拒否する', () => {
      const result = scrapeResponseSchema.safeParse({
        ...validResponse,
        savedCount: 1.5,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('duplicateCount', () => {
    it('0 を受け入れる', () => {
      const result = scrapeResponseSchema.safeParse({
        ...validResponse,
        duplicateCount: 0,
      })
      expect(result.success).toBe(true)
    })

    it('負数を拒否する', () => {
      const result = scrapeResponseSchema.safeParse({
        ...validResponse,
        duplicateCount: -1,
      })
      expect(result.success).toBe(false)
    })
  })

  describe('duplicates', () => {
    it('existingStores が空配列を拒否する', () => {
      const result = scrapeResponseSchema.safeParse({
        savedCount: 1,
        duplicateCount: 1,
        duplicates: [
          {
            title: 'テスト',
            existingStores: [],
          },
        ],
      })
      expect(result.success).toBe(false)
    })

    it('title が空文字を拒否する', () => {
      const result = scrapeResponseSchema.safeParse({
        savedCount: 1,
        duplicateCount: 1,
        duplicates: [
          {
            title: '',
            existingStores: ['kindle'],
          },
        ],
      })
      expect(result.success).toBe(false)
    })
  })

  describe('必須フィールド', () => {
    it('savedCount 欠落を拒否する', () => {
      const { savedCount: _, ...noSavedCount } = validResponse
      expect(scrapeResponseSchema.safeParse(noSavedCount).success).toBe(false)
    })

    it('duplicateCount 欠落を拒否する', () => {
      const { duplicateCount: _, ...noDuplicateCount } = validResponse
      expect(scrapeResponseSchema.safeParse(noDuplicateCount).success).toBe(false)
    })

    it('duplicates 欠落を拒否する', () => {
      const { duplicates: _, ...noDuplicates } = validResponse
      expect(scrapeResponseSchema.safeParse(noDuplicates).success).toBe(false)
    })
  })
})
