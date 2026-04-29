import type { SupabaseClient } from '@supabase/supabase-js'
import type { Store } from '@bookhub/shared'
import { buildQuotedIlikePattern } from './postgrest-helpers'

export interface UserSeries {
  seriesId: string
  title: string
  author: string
  volumeCount: number
  coverThumbnailUrl: string | null
  stores: Store[]
  lastAddedAt: string
}

export interface GetUserSeriesQuery {
  q?: string
  page: number
  limit: number
}

export interface GetUserSeriesResult {
  series: UserSeries[]
  total: number
  page: number
  limit: number
}

interface UserSeriesRow {
  series_id: string
  title: string
  author: string
  volume_count: number
  cover_thumbnail_url: string | null
  stores: string[]
  last_added_at: string
}

export async function getUserSeries(
  supabase: SupabaseClient,
  userId: string,
  query: GetUserSeriesQuery,
): Promise<GetUserSeriesResult> {
  let qb = supabase
    .from('user_series_view')
    .select('series_id, title, author, volume_count, cover_thumbnail_url, stores, last_added_at', {
      count: 'exact',
    })
    // RLS と併せた defense in depth: view は security_invoker で内部 RLS が
    // 効くが、明示的な user_id フィルタを残して二重防御する。
    .eq('user_id', userId)

  if (query.q) {
    const pattern = buildQuotedIlikePattern(query.q)
    qb = qb.or(`title.ilike.${pattern},author.ilike.${pattern}`)
  }

  const offset = (query.page - 1) * query.limit
  qb = qb.order('title').range(offset, offset + query.limit - 1)

  const { data, count, error } = await qb

  if (error) throw new Error(`user_series_view SELECT failed: ${error.message}`)

  const rows = (data ?? []) as unknown as UserSeriesRow[]

  const series: UserSeries[] = rows.map((row) => ({
    seriesId: row.series_id,
    title: row.title,
    author: row.author,
    volumeCount: row.volume_count,
    coverThumbnailUrl: row.cover_thumbnail_url,
    stores: row.stores as Store[],
    lastAddedAt: row.last_added_at,
  }))

  return {
    series,
    total: count ?? 0,
    page: query.page,
    limit: query.limit,
  }
}
