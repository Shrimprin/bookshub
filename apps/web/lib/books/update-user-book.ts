import type { SupabaseClient } from '@supabase/supabase-js'
import type { UpdateUserBook, BookWithStore, Store } from '@bookhub/shared'

type UpdateUserBookResult = BookWithStore | { error: 'not_found'; message: string }

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

export async function updateUserBook(
  supabase: SupabaseClient,
  userId: string,
  userBookId: string,
  data: UpdateUserBook,
): Promise<UpdateUserBookResult> {
  // UPDATE + SELECT を 1 往復で実行。RLS + 明示的 user_id フィルタで二重防御。
  const {
    data: updated,
    error,
    count,
  } = await supabase
    .from('user_books')
    .update({ store: data.store }, { count: 'exact' })
    .eq('id', userBookId)
    .eq('user_id', userId)
    .select(
      'id, store, created_at, books!inner(id, volume_number, thumbnail_url, isbn, published_at, is_adult, store_product_id, created_at, series!inner(title, author))',
    )
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      return { error: 'not_found', message: '指定されたレコードが見つかりません' }
    }
    throw new Error(`user_books UPDATE failed: ${error.message}`)
  }

  if (count === 0 || !updated) {
    return { error: 'not_found', message: '指定されたレコードが見つかりません' }
  }

  const row = updated as unknown as UserBookWithBooks

  return {
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
    store: row.store as Store,
    storeProductId: row.books.store_product_id,
    userBookCreatedAt: row.created_at,
  }
}
