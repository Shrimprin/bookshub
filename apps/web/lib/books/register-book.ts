import type { SupabaseClient } from '@supabase/supabase-js'
import type { RegisterBook, RegisterBookResponse, Store } from '@bookhub/shared'
import { normalizeText, findExistingBook, insertBook } from '@/lib/books/book-repository'

type RegisterBookResult = RegisterBookResponse | { error: 'conflict'; message: string }

export async function registerBook(
  supabase: SupabaseClient,
  userId: string,
  data: RegisterBook,
): Promise<RegisterBookResult> {
  const title = normalizeText(data.title)
  const author = normalizeText(data.author)

  // Step 1: books テーブルで既存チェック or 新規 INSERT
  const existing = await findExistingBook(supabase, title, author, data.volumeNumber)
  const bookRow = existing ?? (await insertBook(supabase, { ...data, title, author }))

  // Step 2: 別ストアで所持しているか確認（二度買い防止）
  const { data: existingUserBooks, error: selectError } = await supabase
    .from('user_books')
    .select('store')
    .eq('user_id', userId)
    .eq('book_id', bookRow.id)

  if (selectError) throw new Error(`user_books SELECT failed: ${selectError.message}`)

  const existingStores = ((existingUserBooks ?? []) as { store: string }[])
    .map((ub) => ub.store)
    .filter((s) => s !== data.store) as Store[]

  // Step 3: user_books に INSERT
  const { data: insertedData, error: insertError } = await supabase
    .from('user_books')
    .insert({
      user_id: userId,
      book_id: bookRow.id,
      store: data.store,
    })
    .select('id, store, created_at')

  if (insertError) {
    if (insertError.code === '23505') {
      return {
        error: 'conflict',
        message: `この書籍は既に ${data.store} で登録されています`,
      }
    }
    throw new Error(`user_books INSERT failed: ${insertError.message}`)
  }

  const userBook = (insertedData as { id: string; store: string; created_at: string }[])?.[0]
  if (!userBook) throw new Error('user_books INSERT returned no data')

  return {
    book: {
      id: bookRow.id,
      title: bookRow.title,
      author: bookRow.author,
      volumeNumber: bookRow.volume_number,
      thumbnailUrl: data.thumbnailUrl ?? null,
      isbn: data.isbn ?? null,
      publishedAt: data.publishedAt ?? null,
      isAdult: data.isAdult,
      createdAt: userBook.created_at,
      userBookId: userBook.id,
      store: userBook.store as Store,
      userBookCreatedAt: userBook.created_at,
    },
    alreadyOwned: existingStores.length > 0,
    existingStores,
  }
}
