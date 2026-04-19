import type { SupabaseClient } from '@supabase/supabase-js'

export interface BookRow {
  id: string
  series_id: string
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
  'id, series_id, title, author, volume_number, thumbnail_url, isbn, published_at, is_adult, store_product_id'

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
  // series と books を atomic に登録する RPC を呼ぶ。クライアント側で
  // series upsert → books insert を分けると、前者成功・後者失敗時に
  // orphan series が残るため (20260419000002_upsert_book_with_series_rpc.sql)。
  const { data, error } = await supabase
    .rpc('upsert_book_with_series', {
      p_title: normalizeText(book.title),
      p_author: normalizeText(book.author),
      p_volume_number: book.volumeNumber ?? null,
      p_thumbnail_url: book.thumbnailUrl ?? null,
      p_isbn: book.isbn ?? null,
      p_published_at: book.publishedAt ?? null,
      p_is_adult: book.isAdult ?? false,
      p_store_product_id: book.storeProductId ?? null,
    })
    .single()

  if (error) throw new Error(`upsert_book_with_series RPC failed: ${error.message}`)
  if (!data) throw new Error('upsert_book_with_series returned no data — possible RLS issue')
  return data as BookRow
}
