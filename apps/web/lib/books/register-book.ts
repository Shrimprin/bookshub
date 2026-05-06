import type { SupabaseClient } from '@supabase/supabase-js'
import type { RegisterBook, RegisterBookResponse, Store } from '@bookhub/shared'
import { extractSeriesTitle, extractVolumeNumber } from '@bookhub/shared'
import { normalizeText, findExistingBook, insertBook } from '@/lib/books/book-repository'
import { refreshSeriesNextVolume } from '@/lib/next-volume/refresh-series-next-volume'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

type RegisterBookResult = RegisterBookResponse | { error: 'conflict'; message: string }

const SYNC_LOOKUP_TIMEOUT_MS = 2000

export async function registerBook(
  supabase: SupabaseClient,
  userId: string,
  data: RegisterBook,
): Promise<RegisterBookResult> {
  // 防御層: 拡張機能経由の scrape とは別に手動登録経路もあるため、title に
  // 巻数やラベルが含まれる場合はここでも series title と volume_number に分解する
  const parsedTitle = extractSeriesTitle(data.title) || data.title
  const parsedVolume = data.volumeNumber ?? extractVolumeNumber(data.title)
  const title = normalizeText(parsedTitle)
  const author = normalizeText(data.author)

  // Step 1: books テーブルで既存チェック or 新規 INSERT
  const { book: existing, seriesExisted } = await findExistingBook(
    supabase,
    title,
    author,
    parsedVolume,
  )
  const bookRow =
    existing ?? (await insertBook(supabase, { ...data, title, author, volumeNumber: parsedVolume }))

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

  // Step 4: 新規シリーズ + 巻数あり → 次巻 sync lookup を best-effort で実行
  // ユーザーが UI で待っている文脈なので 2 秒で打ち切る。失敗しても本登録結果は返す。
  if (!seriesExisted && bookRow.volume_number != null) {
    try {
      const serviceRole = createServiceRoleClient()
      await refreshSeriesNextVolume(serviceRole, {
        seriesId: bookRow.series_id,
        seriesTitle: bookRow.series.title,
        author: bookRow.series.author,
        currentMaxVolume: bookRow.volume_number,
        timeoutMs: SYNC_LOOKUP_TIMEOUT_MS,
      })
    } catch (err) {
      console.warn('[register-book] next-volume sync lookup failed:', err)
    }
  }

  return {
    book: {
      id: bookRow.id,
      title: bookRow.series.title,
      author: bookRow.series.author,
      volumeNumber: bookRow.volume_number,
      thumbnailUrl: bookRow.thumbnail_url,
      isbn: bookRow.isbn,
      publishedAt: bookRow.published_at,
      isAdult: bookRow.is_adult,
      // createdAt は書籍マスタ側の created_at (get-user-books と整合)。
      // 所持情報側の created_at は userBookCreatedAt に別フィールドで返す。
      createdAt: bookRow.created_at,
      userBookId: userBook.id,
      store: userBook.store as Store,
      storeProductId: bookRow.store_product_id,
      userBookCreatedAt: userBook.created_at,
    },
    alreadyOwned: existingStores.length > 0,
    existingStores,
  }
}
