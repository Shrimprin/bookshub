import type { SupabaseClient } from '@supabase/supabase-js'
import type { GetBooksQuery, GetBooksResponse, BookWithStore } from '@bookhub/shared'

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

// ilike 用の値を PostgREST `.or()` に安全に埋め込むための 2 段エスケープ。
//
//   1. LIKE メタ文字 (`\`, `%`, `_`) を `\` でエスケープする。`\` を最初にするのは、
//      後続の `\%` / `\_` 置換で生成した `\` を二重エスケープしないため。
//   2. PostgREST のフィルタ値として `.or()` に渡すため、値を `"..."` で囲む。
//      PostgREST の `"..."` 構文では `,` `.` `(` `)` `:` 等の構造的メタ文字が
//      literal 扱いになるが、内側の `"` と `\` は `\` でエスケープが必要。
//
// これにより、ユーザー検索クエリに `,` や `(` 等が含まれても `.or()` の
// フィルタ区切りが誤解釈されない。
function buildQuotedIlikePattern(value: string): string {
  const likeEscaped = value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  const pattern = `%${likeEscaped}%`
  const postgrestEscaped = pattern.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${postgrestEscaped}"`
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
