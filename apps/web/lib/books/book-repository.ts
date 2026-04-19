import type { SupabaseClient } from '@supabase/supabase-js'

export interface BookRow {
  id: string
  series_id: string
  volume_number: number | null
  thumbnail_url: string | null
  isbn: string | null
  published_at: string | null
  is_adult: boolean
  store_product_id: string | null
  created_at: string
  // PostgREST embed で series から JOIN 取得する
  series: { title: string; author: string }
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

// `series:series_id(title, author)` は FK (books.series_id → series.id) 経由の
// PostgREST embed で、レスポンスで `series: { title, author }` 形に入れ子展開される。
const BOOK_COLUMNS =
  'id, series_id, volume_number, thumbnail_url, isbn, published_at, is_adult, store_product_id, created_at, series:series_id(title, author)'

export function normalizeText(text: string): string {
  return text.trim().normalize('NFC')
}

export async function findExistingBook(
  supabase: SupabaseClient,
  title: string,
  author: string,
  volumeNumber: number | undefined,
): Promise<BookRow | null> {
  // series は (title, author) でユニーク。先に series.id を解決してから
  // books.series_id + volume_number で検索する 2-query 構成。
  const { data: seriesRow, error: seriesErr } = await supabase
    .from('series')
    .select('id')
    .eq('title', title)
    .eq('author', author)
    .maybeSingle()

  if (seriesErr) throw new Error(`series SELECT failed: ${seriesErr.message}`)
  if (!seriesRow) return null

  let query = supabase.from('books').select(BOOK_COLUMNS).eq('series_id', seriesRow.id)

  if (volumeNumber === undefined) {
    query = query.is('volume_number', null)
  } else {
    query = query.eq('volume_number', volumeNumber)
  }

  const { data, error } = await query
  if (error) throw new Error(`books SELECT failed: ${error.message}`)
  return data && data.length > 0 ? (data[0] as unknown as BookRow) : null
}

export async function insertBook(
  supabase: SupabaseClient,
  book: InsertBookInput,
): Promise<BookRow> {
  const normalizedTitle = normalizeText(book.title)
  const normalizedAuthor = normalizeText(book.author)

  // series と books を atomic に登録する RPC を呼ぶ (orphan series 対策)。
  const { data, error } = await supabase
    .rpc('upsert_book_with_series', {
      p_title: normalizedTitle,
      p_author: normalizedAuthor,
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

  // RPC の戻り値 (books 行) は title/author を持たないため、
  // 入力の normalized 値を series ネストとして合成する。RPC は ON CONFLICT で
  // 既存 series を再利用するので、ここでの値は DB 側の series.title/author と一致する。
  return {
    ...(data as Omit<BookRow, 'series'>),
    series: { title: normalizedTitle, author: normalizedAuthor },
  }
}
