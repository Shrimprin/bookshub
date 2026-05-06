import type { SupabaseClient } from '@supabase/supabase-js'
import { lookupNextVolume } from './next-volume-lookup'

const ERROR_COUNT_THRESHOLD = 5

export type RefreshSeriesNextVolumeParams = {
  seriesId: string
  seriesTitle: string
  author: string
  currentMaxVolume: number | null
  /** 既存 series.next_volume_error_count。省略時は 0。 */
  currentErrorCount?: number
  /** lookup 全体のタイムアウト ms。指定時は AbortController で打ち切る。 */
  timeoutMs?: number
}

/**
 * 楽天 lookup → series テーブル UPDATE のオーケストレーション。
 *
 * Cron 起動および /api/books POST (新規 series 作成時) の両方から呼ばれる。
 * caller は service-role client (DB UPDATE 権限あり) を渡す責務を持つ。
 *
 * - 成功: status / release_date / expected / checked_at / error_count=0 を書く
 * - 失敗: error_count++ のみ書き込み (checked_at は更新しない = 次回 cron で早期 retry)
 * - 失敗 + error_count が閾値に到達: status=unknown を書いて 14 日休止 (poison pill 抑制)
 *
 * lookup 例外も DB UPDATE 例外も基本的には握り潰さず throw する。caller がログる。
 */
export async function refreshSeriesNextVolume(
  supabase: SupabaseClient,
  params: RefreshSeriesNextVolumeParams,
): Promise<void> {
  const {
    seriesId,
    seriesTitle,
    author,
    currentMaxVolume,
    currentErrorCount = 0,
    timeoutMs,
  } = params

  try {
    const lookupPromise = lookupNextVolume({ seriesTitle, author, currentMaxVolume })
    const info = timeoutMs ? await withTimeout(lookupPromise, timeoutMs) : await lookupPromise

    await updateSeries(supabase, seriesId, {
      next_volume_status: info.status,
      next_volume_release_date: info.releaseDate,
      next_volume_expected_number: info.expectedVolumeNumber,
      next_volume_checked_at: info.checkedAt,
      next_volume_error_count: 0,
    })
  } catch {
    const nextErrorCount = currentErrorCount + 1
    if (nextErrorCount >= ERROR_COUNT_THRESHOLD) {
      // poison pill: しきい値到達で unknown を書き 14 日休止
      await updateSeries(supabase, seriesId, {
        next_volume_status: 'unknown',
        next_volume_release_date: null,
        next_volume_expected_number: null,
        next_volume_checked_at: new Date().toISOString(),
        next_volume_error_count: nextErrorCount,
      })
    } else {
      // checked_at は更新しない → cron が次回早期 retry できる
      await updateSeries(supabase, seriesId, {
        next_volume_error_count: nextErrorCount,
      })
    }
  }
}

async function updateSeries(
  supabase: SupabaseClient,
  seriesId: string,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from('series').update(values).eq('id', seriesId)
  if (error) throw new Error(`series UPDATE failed: ${error.message}`)
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`refresh timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (e) => {
        clearTimeout(timer)
        reject(e)
      },
    )
  })
}
