import { determineNextVolumeStatus } from '../next-volume-status'

const fixedToday = new Date('2026-05-06T00:00:00.000Z')

describe('determineNextVolumeStatus', () => {
  describe('releaseDate が null', () => {
    it('「unknown」を返す', () => {
      expect(determineNextVolumeStatus(null, fixedToday)).toBe('unknown')
    })
  })

  describe('YYYY-MM-DD 形式', () => {
    it('過去の日付は「released」', () => {
      expect(determineNextVolumeStatus('2026-05-05', fixedToday)).toBe('released')
    })

    it('当日は「released」(発売日 = 今日は発売済み扱い)', () => {
      expect(determineNextVolumeStatus('2026-05-06', fixedToday)).toBe('released')
    })

    it('未来の日付は「scheduled」', () => {
      expect(determineNextVolumeStatus('2026-05-07', fixedToday)).toBe('scheduled')
    })
  })

  describe('YYYY-MM 形式 (当月末日と比較)', () => {
    it('過去の月は「released」', () => {
      expect(determineNextVolumeStatus('2026-04', fixedToday)).toBe('released')
    })

    it('現在月は「scheduled」(月末まで未確定)', () => {
      // 2026-05-06 時点で「2026-05」発売予定 → 月末まで予定扱い
      expect(determineNextVolumeStatus('2026-05', fixedToday)).toBe('scheduled')
    })

    it('未来の月は「scheduled」', () => {
      expect(determineNextVolumeStatus('2026-06', fixedToday)).toBe('scheduled')
    })
  })

  describe('YYYY 形式 (当年末と比較)', () => {
    it('過去の年は「released」', () => {
      expect(determineNextVolumeStatus('2025', fixedToday)).toBe('released')
    })

    it('現在年は「scheduled」(年末まで未確定)', () => {
      expect(determineNextVolumeStatus('2026', fixedToday)).toBe('scheduled')
    })

    it('未来の年は「scheduled」', () => {
      expect(determineNextVolumeStatus('2027', fixedToday)).toBe('scheduled')
    })
  })

  describe('不正フォーマット', () => {
    it('空文字列は「unknown」', () => {
      expect(determineNextVolumeStatus('', fixedToday)).toBe('unknown')
    })

    it('スラッシュ区切りは「unknown」', () => {
      expect(determineNextVolumeStatus('2026/05/07', fixedToday)).toBe('unknown')
    })
  })
})
