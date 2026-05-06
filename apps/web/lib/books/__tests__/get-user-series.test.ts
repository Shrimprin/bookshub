import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserSeries } from '../get-user-series'

// --- Mock helpers ---

function createMockSupabase(result: {
  data: Record<string, unknown>[] | null
  count: number | null
  error: { message: string } | null
}) {
  const builder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: undefined as unknown,
  }
  Object.defineProperty(builder, 'then', {
    value: (resolve: (v: unknown) => void) => {
      resolve(result)
      return Promise.resolve(result)
    },
  })
  return {
    from: vi.fn().mockReturnValue(builder),
    _builder: builder,
  } as unknown as SupabaseClient & { _builder: typeof builder }
}

const userId = 'user-uuid-123'

const mockRow = {
  series_id: 'series-1',
  title: 'ワンピース',
  author: '尾田栄一郎',
  volume_count: 105,
  cover_thumbnail_url: 'https://example.com/op-1.jpg',
  stores: ['kindle'],
  last_added_at: '2026-04-19T08:19:21.483347Z',
  next_volume_status: null,
  next_volume_release_date: null,
  next_volume_expected_number: null,
  next_volume_checked_at: null,
}

// --- Tests ---

describe('getUserSeries', () => {
  it('view の結果を camelCase に変換する', async () => {
    const supabase = createMockSupabase({ data: [mockRow], count: 1, error: null })

    const result = await getUserSeries(supabase, userId, { page: 1, limit: 20 })

    expect(result.series).toHaveLength(1)
    expect(result.series[0]).toEqual({
      seriesId: 'series-1',
      title: 'ワンピース',
      author: '尾田栄一郎',
      volumeCount: 105,
      coverThumbnailUrl: 'https://example.com/op-1.jpg',
      stores: ['kindle'],
      lastAddedAt: '2026-04-19T08:19:21.483347Z',
      nextVolume: null,
    })
    expect(result.total).toBe(1)
    expect(result.page).toBe(1)
    expect(result.limit).toBe(20)
  })

  describe('nextVolume マッピング', () => {
    it('next_volume_status が null なら nextVolume も null', async () => {
      const supabase = createMockSupabase({ data: [mockRow], count: 1, error: null })

      const result = await getUserSeries(supabase, userId, { page: 1, limit: 20 })

      expect(result.series[0]?.nextVolume).toBeNull()
    })

    it('next_volume_status が設定されていれば NextVolumeInfo を組み立てる', async () => {
      const row = {
        ...mockRow,
        next_volume_status: 'scheduled',
        next_volume_release_date: '2026-08-04',
        next_volume_expected_number: 108,
        next_volume_checked_at: '2026-05-06T10:00:00.000Z',
      }
      const supabase = createMockSupabase({ data: [row], count: 1, error: null })

      const result = await getUserSeries(supabase, userId, { page: 1, limit: 20 })

      expect(result.series[0]?.nextVolume).toEqual({
        status: 'scheduled',
        expectedVolumeNumber: 108,
        releaseDate: '2026-08-04',
        checkedAt: '2026-05-06T10:00:00.000Z',
      })
    })

    it('release_date が null でも status があれば NextVolumeInfo を返す', async () => {
      const row = {
        ...mockRow,
        next_volume_status: 'unknown',
        next_volume_release_date: null,
        next_volume_expected_number: null,
        next_volume_checked_at: '2026-05-06T10:00:00.000Z',
      }
      const supabase = createMockSupabase({ data: [row], count: 1, error: null })

      const result = await getUserSeries(supabase, userId, { page: 1, limit: 20 })

      expect(result.series[0]?.nextVolume).toEqual({
        status: 'unknown',
        expectedVolumeNumber: null,
        releaseDate: null,
        checkedAt: '2026-05-06T10:00:00.000Z',
      })
    })

    it('select 句に next_volume_* 列が含まれる', async () => {
      const supabase = createMockSupabase({ data: [], count: 0, error: null })

      await getUserSeries(supabase, userId, { page: 1, limit: 20 })

      const selectArg = supabase._builder.select.mock.calls[0]?.[0] as string
      expect(selectArg).toContain('next_volume_status')
      expect(selectArg).toContain('next_volume_release_date')
      expect(selectArg).toContain('next_volume_expected_number')
      expect(selectArg).toContain('next_volume_checked_at')
    })
  })

  it('user_series_view から user_id eq でフィルタする (defense in depth)', async () => {
    const supabase = createMockSupabase({ data: [], count: 0, error: null })

    await getUserSeries(supabase, userId, { page: 1, limit: 20 })

    expect(supabase.from).toHaveBeenCalledWith('user_series_view')
    expect(supabase._builder.eq).toHaveBeenCalledWith('user_id', userId)
  })

  it('cover_thumbnail_url が NULL の行は coverThumbnailUrl: null にマッピングされる', async () => {
    const nullRow = { ...mockRow, cover_thumbnail_url: null }
    const supabase = createMockSupabase({ data: [nullRow], count: 1, error: null })

    const result = await getUserSeries(supabase, userId, { page: 1, limit: 20 })

    expect(result.series[0]?.coverThumbnailUrl).toBeNull()
  })

  it('複数ストアの stores 配列が保持される', async () => {
    const multiStoreRow = { ...mockRow, stores: ['dmm', 'kindle'] }
    const supabase = createMockSupabase({ data: [multiStoreRow], count: 1, error: null })

    const result = await getUserSeries(supabase, userId, { page: 1, limit: 20 })

    expect(result.series[0]?.stores).toEqual(['dmm', 'kindle'])
  })

  it('結果が空の場合、空配列を返す', async () => {
    const supabase = createMockSupabase({ data: [], count: 0, error: null })

    const result = await getUserSeries(supabase, userId, { page: 1, limit: 20 })

    expect(result.series).toEqual([])
    expect(result.total).toBe(0)
  })

  it('q パラメータがある場合、or フィルタを呼ぶ', async () => {
    const supabase = createMockSupabase({ data: [], count: 0, error: null })

    await getUserSeries(supabase, userId, { q: 'ワンピ', page: 1, limit: 20 })

    expect(supabase._builder.or).toHaveBeenCalledTimes(1)
    const orCall = supabase._builder.or.mock.calls[0]?.[0] as string
    expect(orCall).toMatch(/title\.ilike\.".*ワンピ.*"/)
    expect(orCall).toMatch(/author\.ilike\.".*ワンピ.*"/)
  })

  it('q が無い場合、or フィルタを呼ばない', async () => {
    const supabase = createMockSupabase({ data: [], count: 0, error: null })

    await getUserSeries(supabase, userId, { page: 1, limit: 20 })

    expect(supabase._builder.or).not.toHaveBeenCalled()
  })

  it('q に LIKE メタ文字や `,` が含まれてもエスケープされる', async () => {
    const supabase = createMockSupabase({ data: [], count: 0, error: null })

    await getUserSeries(supabase, userId, { q: '50%,_off', page: 1, limit: 20 })

    const orCall = supabase._builder.or.mock.calls[0]?.[0] as string
    // `%` `_` は LIKE エスケープで `\%` `\_` 化され、PostgREST の文字列 quote のために
    // さらに `\` が `\\` に二重化される。`,` は `"..."` 囲みで literal 化 (or 区切りに誤解されない)。
    expect(orCall).toContain('50\\\\%,\\\\_off')
    expect(orCall).toMatch(/title\.ilike\."[^"]*"/)
    expect(orCall).toMatch(/author\.ilike\."[^"]*"/)
  })

  it('page/limit に応じて range が正しい offset で呼ばれる', async () => {
    const supabase = createMockSupabase({ data: [], count: 0, error: null })

    await getUserSeries(supabase, userId, { page: 3, limit: 10 })

    expect(supabase._builder.range).toHaveBeenCalledWith(20, 29)
  })

  it('title 昇順 + series_id tie-breaker でソートする (ページング安定化)', async () => {
    const supabase = createMockSupabase({ data: [], count: 0, error: null })

    await getUserSeries(supabase, userId, { page: 1, limit: 20 })

    expect(supabase._builder.order).toHaveBeenNthCalledWith(1, 'title', { ascending: true })
    expect(supabase._builder.order).toHaveBeenNthCalledWith(2, 'series_id', { ascending: true })
  })

  it('page=0 は 1 にコエルスして range は negative にならない', async () => {
    const supabase = createMockSupabase({ data: [], count: 0, error: null })

    const result = await getUserSeries(supabase, userId, { page: 0, limit: 20 })

    expect(supabase._builder.range).toHaveBeenCalledWith(0, 19)
    expect(result.page).toBe(1)
  })

  it('limit=0 は 1 にコエルスする', async () => {
    const supabase = createMockSupabase({ data: [], count: 0, error: null })

    const result = await getUserSeries(supabase, userId, { page: 1, limit: 0 })

    expect(supabase._builder.range).toHaveBeenCalledWith(0, 0)
    expect(result.limit).toBe(1)
  })

  it('stores に想定外の値が含まれる場合はフィルタで除外する', async () => {
    const dirtyRow = { ...mockRow, stores: ['kindle', 'invalid_store', 'dmm'] }
    const supabase = createMockSupabase({ data: [dirtyRow], count: 1, error: null })

    const result = await getUserSeries(supabase, userId, { page: 1, limit: 20 })

    expect(result.series[0]?.stores).toEqual(['kindle', 'dmm'])
  })

  it('stores が null/undefined の場合は空配列にフォールバックする', async () => {
    const nullStoresRow = { ...mockRow, stores: null }
    const supabase = createMockSupabase({ data: [nullStoresRow], count: 1, error: null })

    const result = await getUserSeries(supabase, userId, { page: 1, limit: 20 })

    expect(result.series[0]?.stores).toEqual([])
  })

  it('DB エラー時に throw する', async () => {
    const supabase = createMockSupabase({
      data: null,
      count: null,
      error: { message: 'permission denied' },
    })

    await expect(getUserSeries(supabase, userId, { page: 1, limit: 20 })).rejects.toThrow(
      /user_series_view SELECT failed/,
    )
  })
})
