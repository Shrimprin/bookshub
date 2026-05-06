import { render, screen } from '@testing-library/react'
import type { UserSeries } from '@/lib/books/get-user-series'
import { SeriesCard } from '../series-card'

const baseSeries: UserSeries = {
  seriesId: '11111111-1111-1111-1111-111111111111',
  title: 'ワンピース',
  author: '尾田栄一郎',
  volumeCount: 105,
  coverThumbnailUrl: 'https://m.media-amazon.com/images/I/abc.jpg',
  stores: ['kindle'],
  lastAddedAt: '2024-01-01T00:00:00.000Z',
  nextVolume: null,
}

describe('SeriesCard', () => {
  it('シリーズタイトルと著者を表示する', () => {
    render(<SeriesCard series={baseSeries} />)
    expect(screen.getByText('ワンピース')).toBeInTheDocument()
    expect(screen.getByText('尾田栄一郎')).toBeInTheDocument()
  })

  it('巻数バッジを「N 巻所持」で表示する (全 N 巻と誤解させない)', () => {
    render(<SeriesCard series={baseSeries} />)
    expect(screen.getByText('105 巻所持')).toBeInTheDocument()
  })

  it('/bookshelf/series/[id] への内部 Link を生成する', () => {
    render(<SeriesCard series={baseSeries} />)
    const link = screen.getByRole('link', { name: /ワンピース の巻一覧を開く/ })
    expect(link.getAttribute('href')).toBe('/bookshelf/series/11111111-1111-1111-1111-111111111111')
  })

  it('coverThumbnailUrl が null のとき "No Cover" プレースホルダを描画する', () => {
    render(<SeriesCard series={{ ...baseSeries, coverThumbnailUrl: null }} />)
    expect(screen.getByText('No Cover')).toBeInTheDocument()
  })

  it('coverThumbnailUrl があるとき img タグを描画する (Edge 用 plain img)', () => {
    render(<SeriesCard series={baseSeries} />)
    const img = screen.getByAltText(/ワンピース の書影/) as HTMLImageElement
    expect(img.tagName).toBe('IMG')
    expect(img.src).toBe('https://m.media-amazon.com/images/I/abc.jpg')
  })

  it('複数ストア所有時は StoreBadge を複数描画する', () => {
    render(<SeriesCard series={{ ...baseSeries, stores: ['kindle', 'dmm'] }} />)
    const badges = screen.getAllByLabelText(/購入ストア:/)
    expect(badges).toHaveLength(2)
  })

  describe('次巻バッジ統合', () => {
    it('nextVolume が null の場合は次巻バッジを描画しない', () => {
      render(<SeriesCard series={baseSeries} />)
      expect(screen.queryByText(/次巻/)).not.toBeInTheDocument()
    })

    it('nextVolume.status が released の場合「次巻発売済」を描画する', () => {
      const series: UserSeries = {
        ...baseSeries,
        nextVolume: {
          status: 'released',
          expectedVolumeNumber: 106,
          releaseDate: '2026-03-04',
          checkedAt: '2026-05-06T10:00:00.000Z',
        },
      }
      render(<SeriesCard series={series} />)
      expect(screen.getByText(/次巻発売済/)).toBeInTheDocument()
    })

    it('nextVolume.status が scheduled の場合に発売日付き次巻バッジを描画する', () => {
      const series: UserSeries = {
        ...baseSeries,
        nextVolume: {
          status: 'scheduled',
          expectedVolumeNumber: 106,
          releaseDate: '2026-08-04',
          checkedAt: '2026-05-06T10:00:00.000Z',
        },
      }
      render(<SeriesCard series={series} />)
      expect(screen.getByText(/次巻 08\/04/)).toBeInTheDocument()
    })

    it('nextVolume.status が unknown の場合は次巻バッジを描画しない', () => {
      const series: UserSeries = {
        ...baseSeries,
        nextVolume: {
          status: 'unknown',
          expectedVolumeNumber: null,
          releaseDate: null,
          checkedAt: '2026-05-06T10:00:00.000Z',
        },
      }
      render(<SeriesCard series={series} />)
      expect(screen.queryByText(/次巻/)).not.toBeInTheDocument()
    })
  })
})
