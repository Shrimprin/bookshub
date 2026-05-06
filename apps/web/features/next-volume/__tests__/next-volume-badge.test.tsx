import { render, screen } from '@testing-library/react'
import type { NextVolumeInfo } from '@bookhub/shared'
import { NextVolumeBadge } from '../next-volume-badge'

function makeInfo(overrides: Partial<NextVolumeInfo> = {}): NextVolumeInfo {
  return {
    status: 'released',
    expectedVolumeNumber: 108,
    releaseDate: '2026-03-04',
    checkedAt: '2026-05-06T10:00:00.000Z',
    ...overrides,
  }
}

describe('NextVolumeBadge', () => {
  describe('非表示ケース', () => {
    it('info が null の場合は何も描画しない', () => {
      const { container } = render(<NextVolumeBadge info={null} />)
      expect(container).toBeEmptyDOMElement()
    })

    it('status が unknown の場合は何も描画しない', () => {
      const { container } = render(
        <NextVolumeBadge info={makeInfo({ status: 'unknown', releaseDate: null })} />,
      )
      expect(container).toBeEmptyDOMElement()
    })
  })

  describe('released ステータス', () => {
    it('「次巻発売済」と表示する', () => {
      render(<NextVolumeBadge info={makeInfo({ status: 'released' })} />)
      expect(screen.getByText(/次巻発売済/)).toBeInTheDocument()
    })

    it('aria-label に期待巻数と発売日を含む', () => {
      render(<NextVolumeBadge info={makeInfo({ status: 'released' })} />)
      const badge = screen.getByLabelText(/108\s*巻/)
      expect(badge).toBeInTheDocument()
      expect(badge.getAttribute('aria-label')).toContain('発売済')
    })
  })

  describe('scheduled ステータス', () => {
    it('YYYY-MM-DD 形式の発売日を MM/DD で表示する', () => {
      render(
        <NextVolumeBadge info={makeInfo({ status: 'scheduled', releaseDate: '2026-08-04' })} />,
      )
      expect(screen.getByText(/08\/04/)).toBeInTheDocument()
    })

    it('YYYY-MM 形式の発売日を YYYY/MM で表示する', () => {
      render(<NextVolumeBadge info={makeInfo({ status: 'scheduled', releaseDate: '2026-08' })} />)
      expect(screen.getByText(/2026\/08/)).toBeInTheDocument()
    })

    it('YYYY 形式の発売日を YYYY 年で表示する', () => {
      render(<NextVolumeBadge info={makeInfo({ status: 'scheduled', releaseDate: '2026' })} />)
      expect(screen.getByText(/2026年/)).toBeInTheDocument()
    })

    it('releaseDate が null の場合は「次巻予定」と表示', () => {
      render(<NextVolumeBadge info={makeInfo({ status: 'scheduled', releaseDate: null })} />)
      expect(screen.getByText(/次巻予定/)).toBeInTheDocument()
    })

    it('aria-label に期待巻数を含む', () => {
      render(
        <NextVolumeBadge info={makeInfo({ status: 'scheduled', releaseDate: '2026-08-04' })} />,
      )
      const badge = screen.getByLabelText(/108\s*巻/)
      expect(badge.getAttribute('aria-label')).toContain('発売予定')
    })
  })
})
