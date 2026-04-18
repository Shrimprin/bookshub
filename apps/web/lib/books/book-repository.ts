import type { SupabaseClient } from '@supabase/supabase-js'

export interface BookRow {
  id: string
  title: string
  author: string
  volume_number: number | null
  thumbnail_url: string | null
  isbn: string | null
  published_at: string | null
  is_adult: boolean
  store_product_id: string | null
}

interface InsertBookInput {
  title: string
  author: string
  volumeNumber?: number | undefined
  store: string
  thumbnailUrl?: string | undefined
  isbn?: string | undefined
  publishedAt?: string | undefined
  isAdult?: boolean | undefined
  storeProductId?: string | undefined
}

const BOOK_COLUMNS =
  'id, title, author, volume_number, thumbnail_url, isbn, published_at, is_adult, store_product_id'

export function normalizeText(text: string): string {
  return text.trim().normalize('NFC')
}

export async function findExistingBook(
  supabase: SupabaseClient,
  title: string,
  author: string,
  volumeNumber: number | undefined,
): Promise<BookRow | null> {
  let query = supabase.from('books').select(BOOK_COLUMNS).eq('title', title).eq('author', author)

  if (volumeNumber === undefined) {
    query = query.is('volume_number', null)
  } else {
    query = query.eq('volume_number', volumeNumber)
  }

  const { data, error } = await query
  if (error) throw new Error(`books SELECT failed: ${error.message}`)
  return data && data.length > 0 ? (data[0] as BookRow) : null
}

export async function insertBook(
  supabase: SupabaseClient,
  book: InsertBookInput,
): Promise<BookRow> {
  const { data, error } = await supabase
    .from('books')
    .insert({
      title: normalizeText(book.title),
      author: normalizeText(book.author),
      volume_number: book.volumeNumber ?? null,
      thumbnail_url: book.thumbnailUrl ?? null,
      isbn: book.isbn ?? null,
      published_at: book.publishedAt ?? null,
      is_adult: book.isAdult ?? false,
      store_product_id: book.storeProductId ?? null,
    })
    .select(BOOK_COLUMNS)

  if (error) {
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
