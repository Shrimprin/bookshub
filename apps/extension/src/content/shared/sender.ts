import type { ScrapeBook } from '@bookhub/shared'
import type { SendScrapedBooksResponse } from '../../types/messages.js'

export async function sendScrapedBooks(books: ScrapeBook[]): Promise<SendScrapedBooksResponse> {
  const response: SendScrapedBooksResponse | undefined = await chrome.runtime.sendMessage({
    type: 'SEND_SCRAPED_BOOKS',
    books,
  })

  if (chrome.runtime.lastError) {
    throw new Error(chrome.runtime.lastError.message)
  }

  if (response === undefined) {
    throw new Error('Background script did not respond')
  }

  return response
}
