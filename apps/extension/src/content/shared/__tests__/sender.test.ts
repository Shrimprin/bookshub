import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ScrapeBook } from '@bookhub/shared'
import type { SendScrapedBooksResponse } from '../../../types/messages.js'

const mockSendMessage = vi.fn()

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: mockSendMessage,
    lastError: null,
  },
})

describe('sender', () => {
  let sender: typeof import('../sender.js')

  const testBooks: ScrapeBook[] = [
    {
      title: 'テスト漫画 1巻',
      author: 'テスト作者',
      volumeNumber: 1,
      store: 'kindle',
      isAdult: false,
    },
  ]

  beforeEach(async () => {
    vi.clearAllMocks()
    // lastError をリセット
    Object.defineProperty(chrome.runtime, 'lastError', {
      value: null,
      writable: true,
      configurable: true,
    })
    sender = await import('../sender.js')
  })

  describe('sendScrapedBooks', () => {
    it('chrome.runtime.sendMessage を正しい引数で呼ぶ', async () => {
      const successResponse: SendScrapedBooksResponse = {
        success: true,
        data: { savedCount: 1, duplicateCount: 0, duplicates: [] },
      }
      mockSendMessage.mockResolvedValue(successResponse)

      await sender.sendScrapedBooks(testBooks)

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'SEND_SCRAPED_BOOKS',
        books: testBooks,
      })
    })

    it('成功レスポンスをそのまま返す', async () => {
      const successResponse: SendScrapedBooksResponse = {
        success: true,
        data: { savedCount: 1, duplicateCount: 0, duplicates: [] },
      }
      mockSendMessage.mockResolvedValue(successResponse)

      const result = await sender.sendScrapedBooks(testBooks)
      expect(result).toEqual(successResponse)
    })

    it('エラーレスポンスをそのまま返す', async () => {
      const errorResponse: SendScrapedBooksResponse = {
        success: false,
        error: '未認証',
        code: 'AUTH_ERROR',
      }
      mockSendMessage.mockResolvedValue(errorResponse)

      const result = await sender.sendScrapedBooks(testBooks)
      expect(result).toEqual(errorResponse)
    })

    it('chrome.runtime.lastError がある場合エラーを throw する', async () => {
      Object.defineProperty(chrome.runtime, 'lastError', {
        value: { message: 'Extension context invalidated' },
        writable: true,
        configurable: true,
      })
      mockSendMessage.mockResolvedValue(undefined)

      await expect(sender.sendScrapedBooks(testBooks)).rejects.toThrow(
        'Extension context invalidated',
      )
    })

    it('sendMessage が undefined を返した場合エラーを throw する', async () => {
      mockSendMessage.mockResolvedValue(undefined)

      await expect(sender.sendScrapedBooks(testBooks)).rejects.toThrow()
    })
  })
})
