import { fireEvent, render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

import { ThemeToggle } from '../theme-toggle'

const setThemeMock = vi.fn()
const useThemeMock = vi.fn()
const useSyncExternalStoreMock = vi.fn()

vi.mock('next-themes', () => ({
  useTheme: () => useThemeMock(),
}))

// React 全体は actual を流用しつつ useSyncExternalStore のみ差し替え可能にする
// (vi.spyOn では ESM 制約で property を再定義できない)
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react')
  return {
    ...actual,
    useSyncExternalStore: (...args: Parameters<typeof actual.useSyncExternalStore>) =>
      useSyncExternalStoreMock(...args) as ReturnType<typeof actual.useSyncExternalStore>,
  }
})

describe('ThemeToggle', () => {
  beforeEach(() => {
    setThemeMock.mockReset()
    useThemeMock.mockReset()
    useSyncExternalStoreMock.mockReset()
    // デフォルトは「マウント済み」(getSnapshot=true) を再現
    useSyncExternalStoreMock.mockReturnValue(true)
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

  it('mount 前 (useSyncExternalStore=false) は disabled なプレースホルダーを表示し、setTheme は呼ばれない', () => {
    useSyncExternalStoreMock.mockReturnValue(false)
    useThemeMock.mockReturnValue({ resolvedTheme: 'dark', setTheme: setThemeMock })
    render(<ThemeToggle />)
    const button = screen.getByRole('button', { name: 'テーマ切替' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(setThemeMock).not.toHaveBeenCalled()
  })
})
