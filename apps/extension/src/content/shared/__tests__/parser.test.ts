import { describe, it, expect } from 'vitest'
import type { Store } from '@bookhub/shared'
import { extractVolumeNumber, extractSeriesTitle, parseBooks, type RawBookData } from '../parser.js'

describe('extractVolumeNumber', () => {
  it.each([
    ['ワンピース 107巻', 107],
    ['ワンピース 第107巻', 107],
    ['鬼滅の刃（23）', 23],
    ['鬼滅の刃(23)', 23],
    ['SPY×FAMILY (13)', 13],
    ['SPY×FAMILY（13）', 13],
    ['ONE PIECE Vol.107', 107],
    ['ONE PIECE vol.12', 12],
    ['進撃の巨人 34巻 特装版', 34],
    ['3月のライオン 18巻', 18],
    ['100万の命の上に俺は立っている 8巻', 8],
  ])('"%s" → %i', (title, expected) => {
    expect(extractVolumeNumber(title)).toBe(expected)
  })

  it.each([['火花'], ['コンビニ人間'], ['ノルウェイの森']])(
    '単巻作品 "%s" → undefined',
    (title) => {
      expect(extractVolumeNumber(title)).toBeUndefined()
    },
  )

  it.each([
    ['アニメ化記念版(2024)', undefined],
    ['特典コード付き（12345）', undefined],
  ])('年号・コード "%s" は巻数として抽出しない → %s', (title, expected) => {
    expect(extractVolumeNumber(title)).toBe(expected)
  })

  it.each([
    ['チェンソーマン 17', 17],
    ['SPY×FAMILY 13', 13],
    ['ワンピース 107', 107],
  ])('タイトル末尾の裸の数字 "%s" → %i', (title, expected) => {
    expect(extractVolumeNumber(title)).toBe(expected)
  })
})

describe('extractSeriesTitle', () => {
  it.each([
    ['ワンピース 107巻', 'ワンピース'],
    ['鬼滅の刃（23）', '鬼滅の刃'],
    ['鬼滅の刃(23)', '鬼滅の刃'],
    ['SPY×FAMILY (13)', 'SPY×FAMILY'],
    ['進撃の巨人 34巻 特装版', '進撃の巨人'],
    ['ONE PIECE Vol.107', 'ONE PIECE'],
    ['3月のライオン 18巻', '3月のライオン'],
  ])('"%s" → "%s"', (title, expected) => {
    expect(extractSeriesTitle(title)).toBe(expected)
  })

  it('単巻作品はそのまま返す', () => {
    expect(extractSeriesTitle('火花')).toBe('火花')
  })
})

describe('parseBooks', () => {
  const store: Store = 'kindle'

  it('RawBookData を ScrapeBook に正規化する', () => {
    const raw: RawBookData[] = [
      {
        title: 'ワンピース 107巻',
        author: 'テスト作者',
        thumbnailUrl: 'https://m.media-amazon.com/images/I/test.jpg',
      },
    ]

    const result = parseBooks(raw, store)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      title: 'ワンピース',
      author: 'テスト作者',
      volumeNumber: 107,
      store: 'kindle',
      thumbnailUrl: 'https://m.media-amazon.com/images/I/test.jpg',
      isAdult: false,
    })
  })

  it('複数の書籍を正規化する', () => {
    const raw: RawBookData[] = [
      { title: '鬼滅の刃（23）', author: '吾峠呼世晴' },
      { title: '火花', author: '又吉直樹' },
    ]

    const result = parseBooks(raw, store)

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ title: '鬼滅の刃', volumeNumber: 23 })
    expect(result[1]).toMatchObject({ title: '火花', volumeNumber: undefined })
  })

  it('空タイトルの項目はスキップする', () => {
    const raw: RawBookData[] = [
      { title: '', author: 'テスト作者' },
      { title: 'ワンピース 1巻', author: 'テスト作者' },
    ]

    const result = parseBooks(raw, store)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ title: 'ワンピース' })
  })

  it('空著者名の項目はスキップする', () => {
    const raw: RawBookData[] = [
      { title: 'ワンピース 1巻', author: '' },
      { title: '鬼滅の刃 1巻', author: 'テスト作者' },
    ]

    const result = parseBooks(raw, store)
    expect(result).toHaveLength(1)
  })

  it('著者名の前後空白をトリムする', () => {
    const raw: RawBookData[] = [{ title: 'テスト 1巻', author: '  テスト作者  ' }]

    const result = parseBooks(raw, store)
    expect(result[0]?.author).toBe('テスト作者')
  })

  it('http:// の thumbnailUrl は除外する', () => {
    const raw: RawBookData[] = [
      {
        title: 'テスト 1巻',
        author: 'テスト作者',
        thumbnailUrl: 'http://m.media-amazon.com/images/I/test.jpg',
      },
    ]

    const result = parseBooks(raw, store)
    expect(result[0]?.thumbnailUrl).toBeUndefined()
  })

  it('isAdult フラグを引き継ぐ', () => {
    const raw: RawBookData[] = [{ title: 'テスト 1巻', author: 'テスト作者', isAdult: true }]

    const result = parseBooks(raw, store)
    expect(result[0]?.isAdult).toBe(true)
  })

  it('isAdult 未指定時は false になる', () => {
    const raw: RawBookData[] = [{ title: 'テスト 1巻', author: 'テスト作者' }]

    const result = parseBooks(raw, store)
    expect(result[0]?.isAdult).toBe(false)
  })

  it('seriesTitle が空になる項目はスキップする', () => {
    const raw: RawBookData[] = [
      { title: '1巻', author: 'テスト作者' },
      { title: 'ワンピース 1巻', author: 'テスト作者' },
    ]

    const result = parseBooks(raw, store)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ title: 'ワンピース' })
  })

  it('store を正しく付与する', () => {
    const raw: RawBookData[] = [{ title: 'テスト 1巻', author: 'テスト作者' }]

    const result = parseBooks(raw, 'dmm')
    expect(result[0]?.store).toBe('dmm')
  })
})
