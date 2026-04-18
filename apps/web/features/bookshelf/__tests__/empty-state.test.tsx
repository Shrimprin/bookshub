import { render, screen } from '@testing-library/react'
import { EmptyState } from '../empty-state'

describe('EmptyState', () => {
  it('variant="empty" は「蔵書がまだありません」を表示する', () => {
    render(<EmptyState variant="empty" />)
    expect(screen.getByText('蔵書がまだありません')).toBeInTheDocument()
  })

  it('variant="empty" は拡張機能での取り込みを促す説明を表示する', () => {
    render(<EmptyState variant="empty" />)
    expect(screen.getByText(/Chrome 拡張機能/)).toBeInTheDocument()
  })

  it('variant="no-results" は「検索結果がありません」を表示する', () => {
    render(<EmptyState variant="no-results" />)
    expect(screen.getByText('検索結果がありません')).toBeInTheDocument()
  })
})
