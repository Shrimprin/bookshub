import { lookupNextVolume } from '../next-volume-lookup'
import * as rakutenClient from '../../book-search/rakuten-client'

vi.mock('../../book-search/rakuten-client', () => ({
  searchRakutenBooks: vi.fn(),
}))

const mockSearch = vi.mocked(rakutenClient.searchRakutenBooks)
const fixedNow = new Date('2026-05-06T12:00:00.000Z')

beforeEach(() => {
  mockSearch.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(fixedNow)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('lookupNextVolume', () => {
  it('N+1 巻が見つかり著者一致 → 発売日に応じた status を返す', async () => {
    mockSearch.mockResolvedValue({
      totalCount: 1,
      items: [
        {
          title: 'ワンピース 108',
          author: '尾田栄一郎',
          isbn: '9784088838632',
          volumeNumber: 108,
          publishedAt: '2026-08-04',
        },
      ],
    })

    const result = await lookupNextVolume({
      seriesTitle: 'ワンピース',
      author: '尾田栄一郎',
      currentMaxVolume: 107,
    })

    expect(result.status).toBe('scheduled')
    expect(result.expectedVolumeNumber).toBe(108)
    expect(result.releaseDate).toBe('2026-08-04')
    expect(result.checkedAt).toBe(fixedNow.toISOString())
  })

  it('発売日が過去なら「released」', async () => {
    mockSearch.mockResolvedValue({
      totalCount: 1,
      items: [
        {
          title: 'ワンピース 108',
          author: '尾田栄一郎',
          volumeNumber: 108,
          publishedAt: '2026-03-04',
        },
      ],
    })

    const result = await lookupNextVolume({
      seriesTitle: 'ワンピース',
      author: '尾田栄一郎',
      currentMaxVolume: 107,
    })

    expect(result.status).toBe('released')
    expect(result.releaseDate).toBe('2026-03-04')
  })

  it('発売日不明 (publishedAt なし) でも N+1 巻一致なら scheduled (releaseDate=null)', async () => {
    mockSearch.mockResolvedValue({
      totalCount: 1,
      items: [{ title: 'ワンピース 108', author: '尾田栄一郎', volumeNumber: 108 }],
    })

    const result = await lookupNextVolume({
      seriesTitle: 'ワンピース',
      author: '尾田栄一郎',
      currentMaxVolume: 107,
    })

    expect(result.status).toBe('scheduled')
    expect(result.releaseDate).toBeNull()
    expect(result.expectedVolumeNumber).toBe(108)
  })

  it('検索結果が空 → unknown', async () => {
    mockSearch.mockResolvedValue({ totalCount: 0, items: [] })

    const result = await lookupNextVolume({
      seriesTitle: '未知の作品',
      author: '不明',
      currentMaxVolume: 5,
    })

    expect(result.status).toBe('unknown')
    expect(result.expectedVolumeNumber).toBeNull()
    expect(result.releaseDate).toBeNull()
  })

  it('巻数不一致の結果は無視 → unknown', async () => {
    mockSearch.mockResolvedValue({
      totalCount: 1,
      items: [
        // 既存の 107 巻が再ヒットしただけ
        { title: 'ワンピース 107', author: '尾田栄一郎', volumeNumber: 107 },
      ],
    })

    const result = await lookupNextVolume({
      seriesTitle: 'ワンピース',
      author: '尾田栄一郎',
      currentMaxVolume: 107,
    })

    expect(result.status).toBe('unknown')
  })

  it('著者不一致の結果は無視 → unknown', async () => {
    mockSearch.mockResolvedValue({
      totalCount: 1,
      items: [{ title: 'ワンピース 108', author: '別の作者', volumeNumber: 108 }],
    })

    const result = await lookupNextVolume({
      seriesTitle: 'ワンピース',
      author: '尾田栄一郎',
      currentMaxVolume: 107,
    })

    expect(result.status).toBe('unknown')
  })

  it('著者の空白・全半角差を吸収する', async () => {
    mockSearch.mockResolvedValue({
      totalCount: 1,
      items: [{ title: 'ワンピース 108', author: '尾田 栄一郎', volumeNumber: 108 }],
    })

    const result = await lookupNextVolume({
      seriesTitle: 'ワンピース',
      author: '尾田栄一郎',
      currentMaxVolume: 107,
    })

    expect(result.status).toBe('scheduled')
  })

  it('Rakuten 呼出は N+1 を含む query で行う', async () => {
    mockSearch.mockResolvedValue({ totalCount: 0, items: [] })

    await lookupNextVolume({
      seriesTitle: 'ワンピース',
      author: '尾田栄一郎',
      currentMaxVolume: 107,
    })

    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.stringContaining('108') }),
    )
    expect(mockSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.stringContaining('ワンピース') }),
    )
  })

  it('複数候補から N+1 巻 + 著者一致の 1 件を選ぶ', async () => {
    mockSearch.mockResolvedValue({
      totalCount: 3,
      items: [
        { title: 'ワンピース 107', author: '尾田栄一郎', volumeNumber: 107 },
        {
          title: 'ワンピース 108',
          author: '尾田栄一郎',
          volumeNumber: 108,
          publishedAt: '2026-08-04',
        },
        { title: 'ワンピース総集編', author: '尾田栄一郎' },
      ],
    })

    const result = await lookupNextVolume({
      seriesTitle: 'ワンピース',
      author: '尾田栄一郎',
      currentMaxVolume: 107,
    })

    expect(result.status).toBe('scheduled')
    expect(result.expectedVolumeNumber).toBe(108)
    expect(result.releaseDate).toBe('2026-08-04')
  })

  it('Rakuten がエラーを throw した場合は throw を伝播する (呼び元で握り潰す)', async () => {
    mockSearch.mockRejectedValue(new Error('Rakuten Books API error: HTTP 500'))

    await expect(
      lookupNextVolume({
        seriesTitle: 'X',
        author: 'Y',
        currentMaxVolume: 1,
      }),
    ).rejects.toThrow('Rakuten Books API error')
  })

  it('currentMaxVolume が null の場合は unknown を返し Rakuten を呼ばない', async () => {
    const result = await lookupNextVolume({
      seriesTitle: '単巻作品',
      author: '誰か',
      currentMaxVolume: null,
    })

    expect(result.status).toBe('unknown')
    expect(mockSearch).not.toHaveBeenCalled()
  })
})
