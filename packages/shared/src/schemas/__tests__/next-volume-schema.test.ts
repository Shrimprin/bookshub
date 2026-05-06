import { nextVolumeStatusSchema, nextVolumeInfoSchema } from '../next-volume-schema'

describe('nextVolumeStatusSchema', () => {
  it.each(['unknown', 'scheduled', 'released'])('「%s」を受け入れる', (value) => {
    expect(nextVolumeStatusSchema.safeParse(value).success).toBe(true)
  })

  it('未定義の値を拒否する', () => {
    expect(nextVolumeStatusSchema.safeParse('done').success).toBe(false)
  })
})

describe('nextVolumeInfoSchema', () => {
  const validInfo = {
    status: 'scheduled' as const,
    expectedVolumeNumber: 108,
    releaseDate: '2026-06-04',
    checkedAt: '2026-05-06T10:00:00.000Z',
  }

  it('完全な情報を受け入れる', () => {
    expect(nextVolumeInfoSchema.safeParse(validInfo).success).toBe(true)
  })

  it('expectedVolumeNumber と releaseDate は null 可', () => {
    const result = nextVolumeInfoSchema.safeParse({
      ...validInfo,
      status: 'unknown' as const,
      expectedVolumeNumber: null,
      releaseDate: null,
    })
    expect(result.success).toBe(true)
  })

  it('日付フォーマット (YYYY-MM-DD / YYYY-MM / YYYY) を受け入れる', () => {
    for (const date of ['2026-06-04', '2026-06', '2026']) {
      const result = nextVolumeInfoSchema.safeParse({ ...validInfo, releaseDate: date })
      expect(result.success).toBe(true)
    }
  })

  it('不正な日付フォーマットを拒否する', () => {
    const result = nextVolumeInfoSchema.safeParse({ ...validInfo, releaseDate: '2026/06/04' })
    expect(result.success).toBe(false)
  })

  it('expectedVolumeNumber に 0 以下を拒否する', () => {
    const result = nextVolumeInfoSchema.safeParse({ ...validInfo, expectedVolumeNumber: 0 })
    expect(result.success).toBe(false)
  })

  it('checkedAt に不正な ISO 文字列を拒否する', () => {
    const result = nextVolumeInfoSchema.safeParse({ ...validInfo, checkedAt: 'yesterday' })
    expect(result.success).toBe(false)
  })
})
