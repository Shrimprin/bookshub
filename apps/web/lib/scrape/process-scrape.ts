import type { ScrapeBook, ScrapeResponse } from '@bookhub/shared'
import { extractSeriesTitle, extractVolumeNumber } from '@bookhub/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeText, findExistingBook, insertBook } from '@/lib/books/book-repository'

interface UserBookRow {
  book_id: string
  store: string
}

// 防御層: 拡張機能の古いビルドや手動 POST で parser を通っていないタイトルが
// 届いた場合でも、サーバー側でもう一度 extractSeriesTitle / extractVolumeNumber
// を走らせて正規化する。拡張機能側で parse 済の場合は idempotent なのでコスト無し。
function normalizeScrapeBook(book: ScrapeBook): ScrapeBook {
  const seriesTitle = extractSeriesTitle(book.title)
  const volumeNumber = book.volumeNumber ?? extractVolumeNumber(book.title)
  return {
    ...book,
    title: seriesTitle || book.title,
    volumeNumber,
  }
}

function deduplicateBooks(books: ScrapeBook[]): ScrapeBook[] {
  const seen = new Set<string>()
  return books.filter((book) => {
    const key = `${normalizeText(book.title)}|${normalizeText(book.author)}|${book.volumeNumber ?? 'null'}|${book.store}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

async function getExistingUserBooks(
  supabase: SupabaseClient,
  userId: string,
  bookIds: string[],
): Promise<UserBookRow[]> {
  if (bookIds.length === 0) return []

  const { data, error } = await supabase
    .from('user_books')
    .select('book_id, store')
    .eq('user_id', userId)
    .in('book_id', bookIds)

  if (error) throw new Error(`user_books SELECT failed: ${error.message}`)
  return (data as UserBookRow[]) ?? []
}

export async function processScrapePayload(
  supabase: SupabaseClient,
  userId: string,
  books: ScrapeBook[],
): Promise<ScrapeResponse> {
  // まず防御 parse を適用してから dedup する (parse 後に同一シリーズ・同一巻に
  // 畳まれる可能性があるため順序が重要)
  const normalized = books.map(normalizeScrapeBook)
  const uniqueBooks = deduplicateBooks(normalized)
  const duplicates: ScrapeResponse['duplicates'] = []
  let savedCount = 0

  // Step 1: 各書籍の book_id を解決（既存 or 新規 INSERT）
  const resolvedBooks: { book: ScrapeBook; bookId: string }[] = []

  for (const book of uniqueBooks) {
    const title = normalizeText(book.title)
    const author = normalizeText(book.author)

    const existing = await findExistingBook(supabase, title, author, book.volumeNumber)
    // existing があれば store_product_id の更新は行わない (Out of Scope: レガシー行の事後補完)
    const bookRow = existing ?? (await insertBook(supabase, book))
    resolvedBooks.push({ book, bookId: bookRow.id })
  }

  // Step 2: 既存の user_books を一括取得して重複検知
  const bookIds = resolvedBooks.map((r) => r.bookId)
  const existingUserBooks = await getExistingUserBooks(supabase, userId, bookIds)

  const existingByBookId = new Map<string, string[]>()
  for (const ub of existingUserBooks) {
    const stores = existingByBookId.get(ub.book_id) ?? []
    stores.push(ub.store)
    existingByBookId.set(ub.book_id, stores)
  }

  // Step 3: 重複検知 + user_books upsert
  for (const { book, bookId } of resolvedBooks) {
    const existingStores = existingByBookId.get(bookId) ?? []
    const alreadyOwnedInSameStore = existingStores.includes(book.store)
    const otherStores = existingStores.filter((s) => s !== book.store)

    if (otherStores.length > 0) {
      duplicates.push({
        title: normalizeText(book.title),
        volumeNumber: book.volumeNumber,
        existingStores: otherStores as ScrapeResponse['duplicates'][number]['existingStores'],
      })
    }

    const { error: upsertError } = await supabase.from('user_books').upsert(
      {
        user_id: userId,
        book_id: bookId,
        store: book.store,
      },
      { onConflict: 'user_id,book_id,store' },
    )
    if (upsertError) throw new Error(`user_books UPSERT failed: ${upsertError.message}`)

    if (!alreadyOwnedInSameStore) savedCount += 1
  }

  return {
    savedCount,
    duplicateCount: duplicates.length,
    duplicates,
  }
}
