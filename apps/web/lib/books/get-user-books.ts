import type { SupabaseClient } from '@supabase/supabase-js'
import type { GetBooksQuery, GetBooksResponse, BookWithStore } from '@bookhub/shared'
import { buildQuotedIlikePattern } from './postgrest-helpers'

interface UserBookWithBooks {
  id: string
  store: string
  created_at: string
  books: {
    id: string
    volume_number: number | null
    thumbnail_url: string | null
    isbn: string | null
    published_at: string | null
    is_adult: boolean
    store_product_id: string | null
    created_at: string
    series: {
      title: string
      author: string
    }
  }
}

export async function getUserBooks(
  supabase: SupabaseClient,
  userId: string,
  query: GetBooksQuery,
): Promise<GetBooksResponse> {
  let qb = supabase
    .from('user_books')
    .select(
      'id, store, created_at, books!inner(id, volume_number, thumbnail_url, isbn, published_at, is_adult, store_product_id, created_at, series!inner(title, author))',
      { count: 'exact' },
    )
    // RLS と併せた defense in depth: RLS policy migration のバグや service_role
    // 経由の誤用でも別ユーザーのデータが漏れないよう明示的にフィルタする。
    .eq('user_id', userId)

  if (query.q) {
    const pattern = buildQuotedIlikePattern(query.q)
    // タイトル・著者は series テーブルに移動したため referencedTable はネストパス
    qb = qb.or(`title.ilike.${pattern},author.ilike.${pattern}`, {
      referencedTable: 'books.series',
    })
  }

  if (query.store) {
    qb = qb.eq('store', query.store)
  }

  if (query.isAdult !== undefined) {
    qb = qb.eq('books.is_adult', query.isAdult)
  }

  const offset = (query.page - 1) * query.limit
  qb = qb.range(offset, offset + query.limit - 1)
  qb = qb.order('title', { referencedTable: 'books.series' })
  qb = qb.order('volume_number', { referencedTable: 'books', nullsFirst: false })

  const { data, count, error } = await qb

  if (error) throw new Error(`user_books SELECT failed: ${error.message}`)

  const rows = (data ?? []) as unknown as UserBookWithBooks[]

  const books: BookWithStore[] = rows.map((row) => ({
    id: row.books.id,
    title: row.books.series.title,
    author: row.books.series.author,
    volumeNumber: row.books.volume_number,
    thumbnailUrl: row.books.thumbnail_url,
    isbn: row.books.isbn,
    publishedAt: row.books.published_at,
    isAdult: row.books.is_adult,
    createdAt: row.books.created_at,
    userBookId: row.id,
    store: row.store as BookWithStore['store'],
    storeProductId: row.books.store_product_id,
    userBookCreatedAt: row.created_at,
  }))

  return {
    books,
    total: count ?? 0,
    page: query.page,
    limit: query.limit,
  }
}
