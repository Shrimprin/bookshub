import type { ScrapeBook } from '@bookhub/shared'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScrapeResponse } from '@bookhub/shared'

interface BookRow {
  id: string
  title: string
  author: string
  volume_number: number | null
}

interface UserBookRow {
  book_id: string
  store: string
}

function normalizeText(text: string): string {
  return text.trim().normalize('NFC')
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

async function findExistingBook(
  supabase: SupabaseClient,
  title: string,
  author: string,
  volumeNumber: number | undefined,
): Promise<BookRow | null> {
  let query = supabase
    .from('books')
    .select('id, title, author, volume_number')
    .eq('title', title)
    .eq('author', author)

  if (volumeNumber === undefined) {
    query = query.is('volume_number', null)
  } else {
    query = query.eq('volume_number', volumeNumber)
  }

  const { data, error } = await query
  if (error) throw new Error(`books SELECT failed: ${error.message}`)
  return data && data.length > 0 ? (data[0] as BookRow) : null
}

async function insertBook(supabase: SupabaseClient, book: ScrapeBook): Promise<BookRow> {
  const { data, error } = await supabase
    .from('books')
    .insert({
      title: normalizeText(book.title),
      author: normalizeText(book.author),
      volume_number: book.volumeNumber ?? null,
      thumbnail_url: book.thumbnailUrl ?? null,
      isbn: book.isbn ?? null,
      is_adult: book.isAdult ?? false,
    })
    .select('id, title, author, volume_number')

  if (error) {
    // 競合（部分ユニークインデックス）の場合は既存レコードを取得
    if (error.code === '23505') {
      const existing = await findExistingBook(
        supabase,
        normalizeText(book.title),
        normalizeText(book.author),
        book.volumeNumber,
      )
      if (existing) return existing
    }
    throw new Error(`books INSERT failed: ${error.message}`)
  }

  const row = data && (data as BookRow[])[0]
  if (!row) throw new Error('books INSERT returned no data — possible RLS issue')
  return row
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
  const uniqueBooks = deduplicateBooks(books)
  const duplicates: ScrapeResponse['duplicates'] = []
  let savedCount = 0

  // Step 1: 各書籍の book_id を解決（既存 or 新規 INSERT）
  const resolvedBooks: { book: ScrapeBook; bookId: string }[] = []

  for (const book of uniqueBooks) {
    const title = normalizeText(book.title)
    const author = normalizeText(book.author)

    const existing = await findExistingBook(supabase, title, author, book.volumeNumber)
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
