import type { SupabaseClient } from '@supabase/supabase-js'
import type { NextVolumeInfo, NextVolumeStatus, Store } from '@bookhub/shared'
import { buildQuotedIlikePattern } from './postgrest-helpers'

export interface UserSeries {
  seriesId: string
  title: string
  author: string
  volumeCount: number
  coverThumbnailUrl: string | null
  stores: Store[]
  lastAddedAt: string
  nextVolume: NextVolumeInfo | null
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
  next_volume_status: NextVolumeStatus | null
  next_volume_release_date: string | null
  next_volume_expected_number: number | null
  next_volume_checked_at: string | null
}

const VALID_STORES: ReadonlySet<Store> = new Set(['kindle', 'dmm', 'other'])
const isStore = (value: string): value is Store => VALID_STORES.has(value as Store)

function buildNextVolume(row: UserSeriesRow): NextVolumeInfo | null {
  if (!row.next_volume_status || !row.next_volume_checked_at) return null
  return {
    status: row.next_volume_status,
    expectedVolumeNumber: row.next_volume_expected_number,
    releaseDate: row.next_volume_release_date,
    checkedAt: row.next_volume_checked_at,
  }
}

export async function getUserSeries(
  supabase: SupabaseClient,
  userId: string,
  query: GetUserSeriesQuery,
): Promise<GetUserSeriesResult> {
  // page/limit は Server Component の固定値 (1, 100) や API zod schema を通った
  // 値が渡る前提だが、不正値で range 引数が負になるのを防ぐ defensive guard。
  const page = Math.max(1, Math.floor(query.page) || 1)
  const limit = Math.max(1, Math.floor(query.limit) || 1)

  let qb = supabase
    .from('user_series_view')
    .select(
      'series_id, title, author, volume_count, cover_thumbnail_url, stores, last_added_at, next_volume_status, next_volume_release_date, next_volume_expected_number, next_volume_checked_at',
      {
        count: 'exact',
      },
    )
    // RLS と併せた defense in depth: view は security_invoker で内部 RLS が
    // 効くが、明示的な user_id フィルタを残して二重防御する。
    .eq('user_id', userId)

  if (query.q) {
    const pattern = buildQuotedIlikePattern(query.q)
    qb = qb.or(`title.ilike.${pattern},author.ilike.${pattern}`)
  }

  const offset = (page - 1) * limit
  // 同タイトル複数シリーズがあるとページ跨ぎの重複/取りこぼしが起きうるため、
  // 一意キー (series_id) を tie-breaker として第 2 ソートに加え、ページング安定性を担保。
  qb = qb
    .order('title', { ascending: true })
    .order('series_id', { ascending: true })
    .range(offset, offset + limit - 1)

  const { data, count, error } = await qb

  if (error) throw new Error(`user_series_view SELECT failed: ${error.message}`)

  const rows = (data ?? []) as unknown as UserSeriesRow[]

  const series: UserSeries[] = rows.map((row) => ({
    seriesId: row.series_id,
    title: row.title,
    author: row.author,
    volumeCount: row.volume_count,
    coverThumbnailUrl: row.cover_thumbnail_url,
    // DB 側 CHECK 制約 (`store IN ('kindle', 'dmm', 'other')`) で正規値しか入らない前提だが、
    // 万一 view が想定外値を返しても enum に出ないよう runtime filter でセーフ化。
    stores: (row.stores ?? []).filter(isStore),
    lastAddedAt: row.last_added_at,
    nextVolume: buildNextVolume(row),
  }))

  return {
    series,
    total: count ?? 0,
    page,
    limit,
  }
}
