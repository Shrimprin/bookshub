import { extractVolumeNumber } from '../volume-parser'

describe('extractVolumeNumber', () => {
  describe('括弧付きパターン', () => {
    it('全角括弧 （107）', () => {
      expect(extractVolumeNumber('ワンピース（107）')).toBe(107)
    })

    it('半角括弧 (34)', () => {
      expect(extractVolumeNumber('進撃の巨人(34)')).toBe(34)
    })

    it('全角丸括弧 (13)', () => {
      expect(extractVolumeNumber('SPY×FAMILY(13)')).toBe(13)
    })
  })

  describe('「巻」付きパターン', () => {
    it('数字+巻', () => {
      expect(extractVolumeNumber('NARUTO―ナルト― 72巻')).toBe(72)
    })

    it('第+数字+巻', () => {
      expect(extractVolumeNumber('ドラゴンボール 第42巻')).toBe(42)
    })
  })

  describe('末尾の数字パターン', () => {
    it('スペース+数字', () => {
      expect(extractVolumeNumber('ワンピース 107')).toBe(107)
    })

    it('SPY×FAMILY 13', () => {
      expect(extractVolumeNumber('SPY×FAMILY 13')).toBe(13)
    })
  })

  describe('Vol. パターン', () => {
    it('Vol.5', () => {
      expect(extractVolumeNumber('BEASTARS Vol.5')).toBe(5)
    })

    it('vol.12', () => {
      expect(extractVolumeNumber('チェンソーマン vol.12')).toBe(12)
    })
  })

  describe('巻数なし', () => {
    it('単巻のタイトル', () => {
      expect(extractVolumeNumber('火花')).toBeUndefined()
    })

    it('数字を含むがタイトルの一部', () => {
      expect(extractVolumeNumber('20世紀少年')).toBeUndefined()
    })

    it('空文字列', () => {
      expect(extractVolumeNumber('')).toBeUndefined()
    })
  })

  describe('エッジケース', () => {
    it('巻数 1', () => {
      expect(extractVolumeNumber('鬼滅の刃 1')).toBe(1)
    })

    it('大きい巻数 200', () => {
      expect(extractVolumeNumber('こちら葛飾区亀有公園前派出所 200')).toBe(200)
    })

    it('【数字】パターン', () => {
      expect(extractVolumeNumber('テスト漫画【5】')).toBe(5)
    })
  })
})
