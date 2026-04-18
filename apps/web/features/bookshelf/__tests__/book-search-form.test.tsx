import { act, fireEvent, render, screen } from '@testing-library/react'
import { BookSearchForm } from '../book-search-form'

const replaceMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/bookshelf',
}))

describe('BookSearchForm', () => {
  beforeEach(() => {
    replaceMock.mockClear()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('defaultValue を input に表示する', () => {
    render(<BookSearchForm defaultValue="ワンピース" />)
    const input = screen.getByRole('searchbox') as HTMLInputElement
    expect(input.value).toBe('ワンピース')
  })

  it('2 文字以上入力後 300ms で router.replace を ?q= 付きで呼ぶ', () => {
    render(<BookSearchForm defaultValue="" />)
    const input = screen.getByRole('searchbox')

    fireEvent.change(input, { target: { value: 'ワンピ' } })
    expect(replaceMock).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(replaceMock).toHaveBeenCalledWith('/bookshelf?q=%E3%83%AF%E3%83%B3%E3%83%94')
  })

  it('1 文字入力時は URL から q を削除する (pathname のみ)', () => {
    render(<BookSearchForm defaultValue="ワンピース" />)
    const input = screen.getByRole('searchbox')

    fireEvent.change(input, { target: { value: 'ワ' } })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(replaceMock).toHaveBeenCalledWith('/bookshelf')
  })

  it('連続入力は debounce され最後の値だけが反映される', () => {
    render(<BookSearchForm defaultValue="" />)
    const input = screen.getByRole('searchbox')

    fireEvent.change(input, { target: { value: 'a' } })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    fireEvent.change(input, { target: { value: 'abc' } })
    act(() => {
      vi.advanceTimersByTime(300)
    })

    expect(replaceMock).toHaveBeenCalledTimes(1)
    expect(replaceMock).toHaveBeenCalledWith('/bookshelf?q=abc')
  })
})
