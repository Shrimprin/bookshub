import type { SupabaseClient } from '@supabase/supabase-js'
import type { BookWithStore } from '@bookhub/shared'

export interface SeriesDetail {
  series: {
    id: string
    title: string
    author: string
  }
  volumes: BookWithStore[]
}

interface UserBookRow {
  id: string
  store: string
  created_at: string
  books: {
    id: string
    series_id: string
    volume_number: number | null
    thumbnail_url: string | null
    isbn: string | null
    published_at: string | null
    is_adult: boolean
    store_product_id: string | null
    created_at: string
    series: {
      id: string
      title: string
      author: string
    }
  }
}

/**
 * 指定 series の所持巻一覧 + シリーズメタを 1 query で取得する。
 *
 * - user_books → books → series を inner join で固定し、`user_id eq` + `series_id eq` でフィルタ
 *   - `.eq('books.series_id', seriesId)` は PostgREST の embedded resource filter として
 *     SQL 側 WHERE 句に変換され、`books!inner` と組み合わさって inner join filter になる
 *     (get-user-books.ts の `books.is_adult` フィルタと同パターン・同セマンティクス)
 * - 0 件なら null を返す。呼出側で `notFound()` を呼ぶ前提
 *   - 存在しない seriesId / 他ユーザーの series (= 自分は所持していない) は同じ「0 件」
 *     になり情報リーク (IDOR) を回避する
 * - 巻は `volume_number ASC NULLS LAST` でソート
 */
export async function getSeriesDetail(
  supabase: SupabaseClient,
  userId: string,
  seriesId: string,
): Promise<SeriesDetail | null> {
  const { data, error } = await supabase
    .from('user_books')
    .select(
      'id, store, created_at, books!inner(id, series_id, volume_number, thumbnail_url, isbn, published_at, is_adult, store_product_id, created_at, series!inner(id, title, author))',
    )
    .eq('user_id', userId)
    .eq('books.series_id', seriesId)
    .order('volume_number', { referencedTable: 'books', nullsFirst: false })

  if (error) throw new Error(`getSeriesDetail SELECT failed: ${error.message}`)

  const rows = (data ?? []) as unknown as UserBookRow[]
  if (rows.length === 0) return null

  // `.eq('books.series_id', seriesId)` で絞っているため全行が同一シリーズを指す前提。
  // 開発環境では誰かが series_id フィルタを外した時に sirent fail しないよう assertion で守る。
  const first = rows[0]!.books.series
  if (process.env.NODE_ENV !== 'production') {
    const inconsistent = rows.find((r) => r.books.series.id !== first.id)
    if (inconsistent) {
      throw new Error(
        `getSeriesDetail invariant violated: rows contain mixed series_ids (${first.id} vs ${inconsistent.books.series.id}). ` +
          'Did you remove the books.series_id filter?',
      )
    }
  }

  const volumes: BookWithStore[] = rows.map((row) => ({
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
    series: { id: first.id, title: first.title, author: first.author },
    volumes,
  }
}
