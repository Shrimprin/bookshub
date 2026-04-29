import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ThemeToggle } from '../theme-toggle'

const setThemeMock = vi.fn()
const useThemeMock = vi.fn()

vi.mock('next-themes', () => ({
  useTheme: () => useThemeMock(),
}))

describe('ThemeToggle', () => {
  beforeEach(() => {
    setThemeMock.mockReset()
    useThemeMock.mockReset()
  })

  it('ダーク状態ではライト切替ボタンを表示し、クリックで light に切り替える', () => {
    useThemeMock.mockReturnValue({ resolvedTheme: 'dark', setTheme: setThemeMock })
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'ライトモードに切替' })
    fireEvent.click(button)
    expect(setThemeMock).toHaveBeenCalledWith('light')
  })

  it('ライト状態ではダーク切替ボタンを表示し、クリックで dark に切り替える', () => {
    useThemeMock.mockReturnValue({ resolvedTheme: 'light', setTheme: setThemeMock })
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'ダークモードに切替' })
    fireEvent.click(button)
    expect(setThemeMock).toHaveBeenCalledWith('dark')
  })
})
