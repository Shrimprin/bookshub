import type { SupabaseClient } from '@supabase/supabase-js'
import type { UpdateUserBook, BookWithStore, Store } from '@bookhub/shared'

type UpdateUserBookResult = BookWithStore | { error: 'not_found'; message: string }

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

export async function updateUserBook(
  supabase: SupabaseClient,
  userId: string,
  userBookId: string,
  data: UpdateUserBook,
): Promise<UpdateUserBookResult> {
  // Step 1: 対象レコード確認
  const { data: existing, error: selectError } = await supabase
    .from('user_books')
    .select(
      'id, store, created_at, books!inner(id, title, author, volume_number, thumbnail_url, isbn, published_at, is_adult, created_at)',
    )
    .eq('id', userBookId)
    .eq('user_id', userId)
    .single()

  if (selectError || !existing) {
    return { error: 'not_found', message: '指定されたレコードが見つかりません' }
  }

  // Step 2: store を更新
  const { data: updated, error: updateError } = await supabase
    .from('user_books')
    .update({ store: data.store })
    .eq('id', userBookId)
    .eq('user_id', userId)
    .select(
      'id, store, created_at, books!inner(id, title, author, volume_number, thumbnail_url, isbn, published_at, is_adult, created_at)',
    )
    .single()

  if (updateError) throw new Error(`user_books UPDATE failed: ${updateError.message}`)
  if (!updated) throw new Error('user_books UPDATE returned no data')

  const row = updated as unknown as UserBookWithBooks

  return {
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
    store: row.store as Store,
    userBookCreatedAt: row.created_at,
  }
}
