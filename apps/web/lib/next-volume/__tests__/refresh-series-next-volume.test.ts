import type { SupabaseClient } from '@supabase/supabase-js'
import { refreshSeriesNextVolume } from '../refresh-series-next-volume'
import * as lookupModule from '../next-volume-lookup'

vi.mock('../next-volume-lookup', () => ({
  lookupNextVolume: vi.fn(),
}))

const mockLookup = vi.mocked(lookupModule.lookupNextVolume)

function createMockSupabase(updateError: { message: string } | null = null) {
  const builder = {
    update: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  }
  Object.defineProperty(builder, 'then', {
    value: (resolve: (v: unknown) => void) => {
      resolve({ error: updateError })
      return Promise.resolve({ error: updateError })
    },
  })
  return {
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
  } as unknown as SupabaseClient & { _builder: typeof builder }
}

const fixedNow = new Date('2026-05-06T12:00:00.000Z')

beforeEach(() => {
  mockLookup.mockReset()
  vi.useFakeTimers()
  vi.setSystemTime(fixedNow)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('refreshSeriesNextVolume', () => {
  const baseParams = {
    seriesId: '11111111-1111-1111-1111-111111111111',
    seriesTitle: 'ワンピース',
    author: '尾田栄一郎',
    currentMaxVolume: 107,
  }

  it('lookup 成功時に series テーブルを UPDATE する', async () => {
    mockLookup.mockResolvedValue({
      status: 'scheduled',
      expectedVolumeNumber: 108,
      releaseDate: '2026-08-04',
      checkedAt: fixedNow.toISOString(),
    })
    const supabase = createMockSupabase()

    await refreshSeriesNextVolume(supabase, baseParams)

    expect(mockLookup).toHaveBeenCalledWith({
      seriesTitle: 'ワンピース',
      author: '尾田栄一郎',
      currentMaxVolume: 107,
    })
    expect(supabase.from).toHaveBeenCalledWith('series')
    expect(supabase._builder.update).toHaveBeenCalledWith({
      next_volume_status: 'scheduled',
      next_volume_release_date: '2026-08-04',
      next_volume_expected_number: 108,
      next_volume_checked_at: fixedNow.toISOString(),
      next_volume_error_count: 0,
    })
    expect(supabase._builder.eq).toHaveBeenCalledWith('id', baseParams.seriesId)
  })

  it('unknown ステータスでも UPDATE は実行され error_count が 0 にリセットされる', async () => {
    mockLookup.mockResolvedValue({
      status: 'unknown',
      expectedVolumeNumber: null,
      releaseDate: null,
      checkedAt: fixedNow.toISOString(),
    })
    const supabase = createMockSupabase()

    await refreshSeriesNextVolume(supabase, baseParams)

    expect(supabase._builder.update).toHaveBeenCalledWith({
      next_volume_status: 'unknown',
      next_volume_release_date: null,
      next_volume_expected_number: null,
      next_volume_checked_at: fixedNow.toISOString(),
      next_volume_error_count: 0,
    })
  })

  it('lookup が throw した場合、checked_at は更新せず error_count のみインクリメント', async () => {
    mockLookup.mockRejectedValue(new Error('Rakuten Books API error: HTTP 500'))
    const supabase = createMockSupabase()

    await refreshSeriesNextVolume(supabase, { ...baseParams, currentErrorCount: 2 })

    // UPDATE は呼ばれるが、setting には next_volume_status が含まれず
    // error_count のみインクリメント (checked_at は触らない = NULL のまま)
    expect(supabase._builder.update).toHaveBeenCalledWith({
      next_volume_error_count: 3,
    })
    expect(supabase._builder.eq).toHaveBeenCalledWith('id', baseParams.seriesId)
  })

  it('error_count が閾値 (5) を超えた場合は unknown を書き込んで休止する', async () => {
    mockLookup.mockRejectedValue(new Error('persistent error'))
    const supabase = createMockSupabase()

    await refreshSeriesNextVolume(supabase, { ...baseParams, currentErrorCount: 4 })

    // error_count が 5 になった瞬間 (4 → 5) で poison pill 扱い: status=unknown
    // を書き込み、次の cron 起動でも 14 日 TTL 内なら拾われない
    expect(supabase._builder.update).toHaveBeenCalledWith({
      next_volume_status: 'unknown',
      next_volume_release_date: null,
      next_volume_expected_number: null,
      next_volume_checked_at: fixedNow.toISOString(),
      next_volume_error_count: 5,
    })
  })

  it('UPDATE が失敗した場合は throw する (呼び元でログる)', async () => {
    mockLookup.mockResolvedValue({
      status: 'scheduled',
      expectedVolumeNumber: 108,
      releaseDate: null,
      checkedAt: fixedNow.toISOString(),
    })
    const supabase = createMockSupabase({ message: 'permission denied' })

    await expect(refreshSeriesNextVolume(supabase, baseParams)).rejects.toThrow(
      /series UPDATE failed/,
    )
  })

  it('timeoutMs を指定すると lookup がそれを超えた場合 abort して error として扱う', async () => {
    mockLookup.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                status: 'scheduled',
                expectedVolumeNumber: 108,
                releaseDate: null,
                checkedAt: fixedNow.toISOString(),
              }),
            5000,
          ),
        ),
    )
    const supabase = createMockSupabase()

    const promise = refreshSeriesNextVolume(supabase, { ...baseParams, timeoutMs: 2000 })
    // タイマーを進めてタイムアウトを発火
    await vi.advanceTimersByTimeAsync(2100)
    await promise

    // error_count のみインクリメント (lookup 完了前に abort)
    expect(supabase._builder.update).toHaveBeenCalledWith({
      next_volume_error_count: 1,
    })
  })
})
