import type { ScrapeBook } from '@bookhub/shared'
import type { SendScrapedBooksResponse } from '../../types/messages.js'

export async function sendScrapedBooks(books: ScrapeBook[]): Promise<SendScrapedBooksResponse> {
  let response: SendScrapedBooksResponse | undefined
  try {
    response = await chrome.runtime.sendMessage({
      type: 'SEND_SCRAPED_BOOKS',
      books,
    })
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : 'Failed to contact background script')
  }

  if (response === undefined) {
    throw new Error('Background script did not respond')
  }

  return response
}
