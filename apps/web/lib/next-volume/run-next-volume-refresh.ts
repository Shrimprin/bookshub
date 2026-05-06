import type { SupabaseClient } from '@supabase/supabase-js'
import { refreshSeriesNextVolume } from './refresh-series-next-volume'

const TTL_DAYS = 14
const DEFAULT_SLEEP_MS = 1100 // Rakuten 1 req/sec 制限を超えないよう少しマージン

export type RunNextVolumeRefreshOptions = {
  /** 1 起動で処理する series 数。Cloudflare 無料プランの subrequest/CPU time を見て調整。 */
  batchSize: number
  /** series 間の sleep ms。Rakuten レート制限保護。テスト時は省略可。 */
  sleepMs?: number
}

export type RunNextVolumeRefreshResult = {
  processed: number
  errors: number
}

interface SeriesQueueRow {
  id: string
  title: string
  author: string
  next_volume_error_count: number
}

/**
 * 次巻ステータスキャッシュの定期 refresh サイクル。
 *
 * 1. series テーブルから「checked_at が NULL or 14 日以上前」の行を batchSize 件取得
 *    (NULLS FIRST: 新規追加分を最優先)
 * 2. 各 series について books から MAX(volume_number) を取得
 * 3. refreshSeriesNextVolume を呼び、Rakuten lookup → series UPDATE
 * 4. series 間に sleep (Rakuten 1 req/sec 制限保護)
 *
 * 個別 series で例外が発生しても全体は継続する。series SELECT 自体の失敗は throw。
 */
export async function runNextVolumeRefreshCycle(
  supabase: SupabaseClient,
  options: RunNextVolumeRefreshOptions,
): Promise<RunNextVolumeRefreshResult> {
  const { batchSize, sleepMs = DEFAULT_SLEEP_MS } = options
  const cutoff = new Date(Date.now() - TTL_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // PostgREST: `checked_at IS NULL OR checked_at < cutoff` を or() で表現
  const { data, error } = await supabase
    .from('series')
    .select('id, title, author, next_volume_error_count')
    .or(`next_volume_checked_at.is.null,next_volume_checked_at.lt.${cutoff}`)
    .order('next_volume_checked_at', { ascending: true, nullsFirst: true })
    .limit(batchSize)

  if (error) throw new Error(`series SELECT failed: ${error.message}`)

  const queue = (data ?? []) as unknown as SeriesQueueRow[]
  let processed = 0
  let errors = 0

  for (let i = 0; i < queue.length; i++) {
    const row = queue[i]!

    if (i > 0 && sleepMs > 0) {
      await sleep(sleepMs)
    }

    const maxVolume = await fetchMaxVolume(supabase, row.id)
    if (maxVolume == null) {
      // 単巻作品 / 巻数情報なし → lookup 不可 (cron では skip)
      continue
    }

    try {
      await refreshSeriesNextVolume(supabase, {
        seriesId: row.id,
        seriesTitle: row.title,
        author: row.author,
        currentMaxVolume: maxVolume,
        currentErrorCount: row.next_volume_error_count,
      })
      processed++
    } catch {
      // refreshSeriesNextVolume 自身が error_count をインクリメントするはずだが、
      // UPDATE 自体が失敗するケースもあるためここでカウント
      processed++
      errors++
    }
  }

  return { processed, errors }
}

async function fetchMaxVolume(supabase: SupabaseClient, seriesId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from('books')
    .select('volume_number')
    .eq('series_id', seriesId)
    .order('volume_number', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`books MAX SELECT failed: ${error.message}`)
  return data?.volume_number ?? null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
