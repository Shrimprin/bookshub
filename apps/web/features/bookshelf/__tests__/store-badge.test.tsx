import { render, screen } from '@testing-library/react'
import { StoreBadge } from '../store-badge'

describe('StoreBadge', () => {
  it('kindle はラベル "Kindle" を表示する', () => {
    render(<StoreBadge store="kindle" />)
    expect(screen.getByText('Kindle')).toBeInTheDocument()
  })

  it('dmm はラベル "DMM" を表示する', () => {
    render(<StoreBadge store="dmm" />)
    expect(screen.getByText('DMM')).toBeInTheDocument()
  })

  it('other はラベル "その他" を表示する', () => {
    render(<StoreBadge store="other" />)
    expect(screen.getByText('その他')).toBeInTheDocument()
  })

  it('store を aria-label として設定する', () => {
    render(<StoreBadge store="kindle" />)
    expect(screen.getByLabelText('購入ストア: Kindle')).toBeInTheDocument()
  })

  it('className prop を Badge に伝搬する', () => {
    render(<StoreBadge store="kindle" className="absolute right-2 top-2" />)
    const badge = screen.getByLabelText('購入ストア: Kindle')
    expect(badge.className).toContain('absolute')
    expect(badge.className).toContain('right-2')
  })
})
