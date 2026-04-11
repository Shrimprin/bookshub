import type { SupabaseClient } from '@supabase/supabase-js'
import type { GetBooksQuery, GetBooksResponse, BookWithStore } from '@bookhub/shared'

interface UserBookWithBooks {
  id: string
  store: string
  created_at: string
  books: {
    id: string
    title: string
    author: string
    volume_number: number | null
    thumbnail_url: string | null
    isbn: string | null
    published_at: string | null
    is_adult: boolean
    created_at: string
  }
}

function escapeIlike(value: string): string {
  return value.replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export async function getUserBooks(
  supabase: SupabaseClient,
  userId: string,
  query: GetBooksQuery,
): Promise<GetBooksResponse> {
  let qb = supabase
    .from('user_books')
    .select(
      'id, store, created_at, books!inner(id, title, author, volume_number, thumbnail_url, isbn, published_at, is_adult, created_at)',
      { count: 'exact' },
    )
    .eq('user_id', userId)

  if (query.q) {
    const escaped = escapeIlike(query.q)
    qb = qb.or(`title.ilike.%${escaped}%,author.ilike.%${escaped}%`, {
      referencedTable: 'books',
    })
  }

  if (query.store) {
    qb = qb.eq('store', query.store)
  }

  if (query.isAdult !== undefined) {
    qb = qb.eq('is_adult', query.isAdult)
  }

  const offset = (query.page - 1) * query.limit
  qb = qb.range(offset, offset + query.limit - 1)
  qb = qb.order('title', { referencedTable: 'books' })
  qb = qb.order('volume_number', { referencedTable: 'books' })

  const { data, count, error } = await qb

  if (error) throw new Error(`user_books SELECT failed: ${error.message}`)

  const rows = (data ?? []) as unknown as UserBookWithBooks[]

  const books: BookWithStore[] = rows.map((row) => ({
    id: row.books.id,
    title: row.books.title,
    author: row.books.author,
    volumeNumber: row.books.volume_number,
    thumbnailUrl: row.books.thumbnail_url,
    isbn: row.books.isbn,
    publishedAt: row.books.published_at,
    isAdult: row.books.is_adult,
    createdAt: row.books.created_at,
    userBookId: row.id,
    store: row.store as BookWithStore['store'],
    userBookCreatedAt: row.created_at,
  }))

  return {
    books,
    total: count ?? 0,
    page: query.page,
    limit: query.limit,
  }
}
