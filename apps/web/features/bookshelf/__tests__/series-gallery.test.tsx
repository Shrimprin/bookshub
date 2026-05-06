import { render, screen } from '@testing-library/react'
import type { UserSeries } from '@/lib/books/get-user-series'
import { SeriesGallery } from '../series-gallery'

function makeSeries(overrides: Partial<UserSeries> = {}): UserSeries {
  return {
    seriesId: '11111111-1111-1111-1111-111111111111',
    title: 'シリーズ',
    author: '著者',
    volumeCount: 10,
    coverThumbnailUrl: null,
    stores: ['kindle'],
    lastAddedAt: '2024-01-01T00:00:00.000Z',
    nextVolume: null,
    ...overrides,
  }
}

describe('SeriesGallery', () => {
  it('渡されたシリーズを全て描画する', () => {
    const series = [
      makeSeries({ seriesId: 's1', title: 'シリーズA' }),
      makeSeries({ seriesId: 's2', title: 'シリーズB' }),
    ]
    render(<SeriesGallery series={series} />)
    expect(screen.getByText('シリーズA')).toBeInTheDocument()
    expect(screen.getByText('シリーズB')).toBeInTheDocument()
  })

  it('series 空配列で emptyFallback が渡された場合はそれを描画する', () => {
    render(<SeriesGallery series={[]} emptyFallback={<p>該当なし</p>} />)
    expect(screen.getByText('該当なし')).toBeInTheDocument()
  })

  it('series 空配列で emptyFallback が無い場合は何も描画しない', () => {
    const { container } = render(<SeriesGallery series={[]} />)
    expect(container.textContent).toBe('')
  })

  it('series があるとき grid レイアウトの ul を描画する', () => {
    render(<SeriesGallery series={[makeSeries()]} />)
    const list = screen.getByRole('list', { name: /シリーズ一覧/ })
    expect(list.className).toContain('grid')
  })
})
