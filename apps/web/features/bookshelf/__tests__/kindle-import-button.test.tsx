import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KindleImportButton } from '../kindle-import-button'

const triggerMock = vi.fn()
vi.mock('@/lib/extension/trigger-kindle-scrape', () => ({
  triggerKindleScrape: () => triggerMock(),
}))

describe('KindleImportButton', () => {
  beforeEach(() => {
    triggerMock.mockReset()
  })

  it('「Kindle から取り込み」ボタンを表示する', () => {
    render(<KindleImportButton />)
    expect(screen.getByRole('button', { name: /Kindle から取り込み/ })).toBeInTheDocument()
  })

  it('クリック時に sent ならば成功メッセージを表示する', async () => {
    triggerMock.mockResolvedValue({ status: 'sent' })
    render(<KindleImportButton />)
    fireEvent.click(screen.getByRole('button', { name: /Kindle から取り込み/ }))
    await waitFor(() => {
      expect(screen.getByText(/取り込みを開始しました/)).toBeInTheDocument()
    })
  })

  it("'no-extension' なら拡張機能インストール案内を出す", async () => {
    triggerMock.mockResolvedValue({ status: 'no-extension' })
    render(<KindleImportButton />)
    fireEvent.click(screen.getByRole('button', { name: /Kindle から取り込み/ }))
    await waitFor(() => {
      expect(screen.getByText(/拡張機能が見つかりません/)).toBeInTheDocument()
    })
  })

  it("'misconfigured' なら設定不備メッセージを出す (no-extension とは別の文言)", async () => {
    triggerMock.mockResolvedValue({ status: 'misconfigured' })
    render(<KindleImportButton />)
    fireEvent.click(screen.getByRole('button', { name: /Kindle から取り込み/ }))
    await waitFor(() => {
      // 拡張未インストールとは異なる UX (将来管理者向け文言を別途出せる)
      expect(screen.getByText(/設定/)).toBeInTheDocument()
    })
  })

  it("'in-progress' なら進行中メッセージを出す", async () => {
    triggerMock.mockResolvedValue({ status: 'in-progress' })
    render(<KindleImportButton />)
    fireEvent.click(screen.getByRole('button', { name: /Kindle から取り込み/ }))
    await waitFor(() => {
      expect(screen.getByText(/進行中/)).toBeInTheDocument()
    })
  })

  it("'error' + code 指定ならコード別のローカライズ済みメッセージを出す", async () => {
    triggerMock.mockResolvedValue({ status: 'error', code: 'TAB_CREATE_FAILED' })
    render(<KindleImportButton />)
    fireEvent.click(screen.getByRole('button', { name: /Kindle から取り込み/ }))
    await waitFor(() => {
      expect(screen.getByText(/タブの作成に失敗しました/)).toBeInTheDocument()
    })
  })

  it("'error' で code なしなら汎用メッセージを出す (生エラーは UI に流さない)", async () => {
    triggerMock.mockResolvedValue({ status: 'error' })
    render(<KindleImportButton />)
    fireEvent.click(screen.getByRole('button', { name: /Kindle から取り込み/ }))
    await waitFor(() => {
      expect(screen.getByText(/再試行してください/)).toBeInTheDocument()
    })
  })

  it('押下中はボタンが disabled (多重クリック防止)', async () => {
    let resolveTrigger: (() => void) | undefined
    triggerMock.mockReturnValue(
      new Promise((resolve) => {
        resolveTrigger = () => resolve({ status: 'sent' })
      }),
    )
    render(<KindleImportButton />)
    const btn = screen.getByRole('button', { name: /Kindle から取り込み/ })
    fireEvent.click(btn)
    // pending 中は disabled
    await waitFor(() => expect(btn).toBeDisabled())
    resolveTrigger?.()
    await waitFor(() => expect(btn).not.toBeDisabled())
  })
})
