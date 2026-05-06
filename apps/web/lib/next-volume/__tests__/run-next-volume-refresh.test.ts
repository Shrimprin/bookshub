import type { SupabaseClient } from '@supabase/supabase-js'
import { runNextVolumeRefreshCycle } from '../run-next-volume-refresh'
import * as refreshModule from '../refresh-series-next-volume'

vi.mock('../refresh-series-next-volume', () => ({
  refreshSeriesNextVolume: vi.fn(),
}))

const mockRefresh = vi.mocked(refreshModule.refreshSeriesNextVolume)

type SeriesRow = {
  id: string
  title: string
  author: string
  next_volume_error_count: number
}

function createMockSupabase(opts: {
  series?: { data: SeriesRow[] | null; error: { message: string } | null }
  bookMaxByseriesId?: Record<string, number | null>
}) {
  const seriesResult = opts.series ?? { data: [], error: null }
  const maxByseriesId = opts.bookMaxByseriesId ?? {}

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'series') {
        // SELECT id, title, author, next_volume_error_count
        // FROM series WHERE next_volume_checked_at IS NULL OR < N days
        // ORDER BY next_volume_checked_at NULLS FIRST LIMIT N
        const builder = {
          select: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          then: undefined as unknown,
        }
        Object.defineProperty(builder, 'then', {
          value: (resolve: (v: unknown) => void) => {
            resolve(seriesResult)
            return Promise.resolve(seriesResult)
          },
        })
        return builder
      }
      if (table === 'books') {
        // SELECT volume_number FROM books WHERE series_id = X ORDER BY volume_number DESC LIMIT 1
        const builder = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((_col: string, val: string) => {
            const max = maxByseriesId[val] ?? null
            const inner = {
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({
                data: max != null ? { volume_number: max } : null,
                error: null,
              }),
            }
            return inner
          }),
        }
        return builder
      }
      return {}
    }),
  } as unknown as SupabaseClient
}

beforeEach(() => {
  mockRefresh.mockReset()
  mockRefresh.mockResolvedValue(undefined)
})

describe('runNextVolumeRefreshCycle', () => {
  it('queue が空ならスキップして processed=0 を返す', async () => {
    const supabase = createMockSupabase({ series: { data: [], error: null } })

    const result = await runNextVolumeRefreshCycle(supabase, { batchSize: 3 })

    expect(result.processed).toBe(0)
    expect(result.errors).toBe(0)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('queue 内の各 series で refreshSeriesNextVolume を呼ぶ', async () => {
    const series: SeriesRow[] = [
      { id: 's1', title: 'シリーズ1', author: '作者1', next_volume_error_count: 0 },
      { id: 's2', title: 'シリーズ2', author: '作者2', next_volume_error_count: 1 },
    ]
    const supabase = createMockSupabase({
      series: { data: series, error: null },
      bookMaxByseriesId: { s1: 5, s2: 10 },
    })

    const result = await runNextVolumeRefreshCycle(supabase, { batchSize: 3 })

    expect(result.processed).toBe(2)
    expect(mockRefresh).toHaveBeenCalledTimes(2)
    expect(mockRefresh).toHaveBeenNthCalledWith(
      1,
      supabase,
      expect.objectContaining({
        seriesId: 's1',
        seriesTitle: 'シリーズ1',
        author: '作者1',
        currentMaxVolume: 5,
        currentErrorCount: 0,
      }),
    )
    expect(mockRefresh).toHaveBeenNthCalledWith(
      2,
      supabase,
      expect.objectContaining({
        seriesId: 's2',
        seriesTitle: 'シリーズ2',
        author: '作者2',
        currentMaxVolume: 10,
        currentErrorCount: 1,
      }),
    )
  })

  it('refresh が個別 series で throw しても残りの series は処理を継続する', async () => {
    const series: SeriesRow[] = [
      { id: 's1', title: 'A', author: 'a', next_volume_error_count: 0 },
      { id: 's2', title: 'B', author: 'b', next_volume_error_count: 0 },
    ]
    const supabase = createMockSupabase({
      series: { data: series, error: null },
      bookMaxByseriesId: { s1: 1, s2: 1 },
    })
    mockRefresh.mockRejectedValueOnce(new Error('Rakuten 500')).mockResolvedValueOnce(undefined)

    const result = await runNextVolumeRefreshCycle(supabase, { batchSize: 3 })

    expect(result.processed).toBe(2)
    expect(result.errors).toBe(1)
  })

  it('books に該当行が無い (max_volume = null) series はスキップして refresh を呼ばない', async () => {
    const series: SeriesRow[] = [{ id: 's1', title: 'A', author: 'a', next_volume_error_count: 0 }]
    const supabase = createMockSupabase({
      series: { data: series, error: null },
      bookMaxByseriesId: {}, // s1 の max_volume は null
    })

    const result = await runNextVolumeRefreshCycle(supabase, { batchSize: 3 })

    expect(result.processed).toBe(0)
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('series SELECT エラーは throw する (caller で観測される)', async () => {
    const supabase = createMockSupabase({
      series: { data: null, error: { message: 'permission denied' } },
    })

    await expect(runNextVolumeRefreshCycle(supabase, { batchSize: 3 })).rejects.toThrow(
      /series SELECT/,
    )
  })

  it('Rakuten 1 req/sec を守るため series 間に sleepMs だけ wait する', async () => {
    vi.useFakeTimers()
    try {
      const series: SeriesRow[] = [
        { id: 's1', title: 'A', author: 'a', next_volume_error_count: 0 },
        { id: 's2', title: 'B', author: 'b', next_volume_error_count: 0 },
      ]
      const supabase = createMockSupabase({
        series: { data: series, error: null },
        bookMaxByseriesId: { s1: 1, s2: 2 },
      })

      const promise = runNextVolumeRefreshCycle(supabase, { batchSize: 3, sleepMs: 1000 })

      // 1 件目を進める
      await vi.advanceTimersByTimeAsync(0)
      expect(mockRefresh).toHaveBeenCalledTimes(1)

      // sleep 1 秒経過させる
      await vi.advanceTimersByTimeAsync(1000)
      expect(mockRefresh).toHaveBeenCalledTimes(2)

      const result = await promise
      expect(result.processed).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
