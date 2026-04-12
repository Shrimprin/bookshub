import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { ScrapeBook } from '@bookhub/shared'
import type { SendScrapedBooksResponse } from '../../../types/messages.js'

const mockSendMessage = vi.fn()

vi.stubGlobal('chrome', {
  runtime: {
    sendMessage: mockSendMessage,
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

    it('sendMessage が reject した場合エラーを throw する', async () => {
      mockSendMessage.mockRejectedValue(new Error('Extension context invalidated'))

      await expect(sender.sendScrapedBooks(testBooks)).rejects.toThrow(
        'Extension context invalidated',
      )
    })

    it('sendMessage が非 Error で reject した場合も throw する', async () => {
      mockSendMessage.mockRejectedValue('unknown error')

      await expect(sender.sendScrapedBooks(testBooks)).rejects.toThrow(
        'Failed to contact background script',
      )
    })

    it('sendMessage が undefined を返した場合エラーを throw する', async () => {
      mockSendMessage.mockResolvedValue(undefined)

      await expect(sender.sendScrapedBooks(testBooks)).rejects.toThrow()
    })
  })
})
