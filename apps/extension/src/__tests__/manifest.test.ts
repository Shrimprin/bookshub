import { describe, it, expect } from 'vitest'
import manifestFactory from '../../manifest.config.js'

// defineManifest は引数をそのまま返す identity 関数なので、
// 実行時は `manifestFactory(env)` で実際の manifest オブジェクトを得る
type ManifestEnv = Parameters<typeof manifestFactory>[0]

function resolveManifest(mode: 'development' | 'production') {
  const env = { mode, command: 'build' } as unknown as ManifestEnv
  return manifestFactory(env)
}

describe('manifest.config', () => {
  describe('externally_connectable', () => {
    it('development モードで localhost:3000 を許可する', () => {
      const manifest = resolveManifest('development')
      expect(manifest.externally_connectable?.matches).toContain('http://localhost:3000/*')
    })

    it('production モードでは localhost を含めない', () => {
      const manifest = resolveManifest('production')
      expect(manifest.externally_connectable?.matches).not.toContain('http://localhost:3000/*')
    })

    it('externally_connectable.matches はすべて文字列の配列である', () => {
      const manifest = resolveManifest('development')
      const matches = manifest.externally_connectable?.matches
      expect(Array.isArray(matches)).toBe(true)
      for (const match of matches ?? []) {
        expect(typeof match).toBe('string')
      }
    })
  })

  describe('content_scripts', () => {
    it('Kindle の matches は購入履歴ページに限定されている', () => {
      const manifest = resolveManifest('development')
      const kindle = manifest.content_scripts?.find((cs) =>
        cs.js?.some((path: string) => path.includes('kindle')),
      )
      expect(kindle?.matches).toEqual([
        'https://www.amazon.co.jp/hz/mycd/digital-console/contentlist/booksAll/*',
      ])
    })
  })

  describe('permissions', () => {
    it('storage と tabs 権限を持つ', () => {
      const manifest = resolveManifest('development')
      expect(manifest.permissions).toContain('storage')
      expect(manifest.permissions).toContain('tabs')
    })
  })

  describe('host_permissions', () => {
    it('Amazon と DMM を含む', () => {
      const manifest = resolveManifest('development')
      expect(manifest.host_permissions).toContain('https://www.amazon.co.jp/*')
      expect(manifest.host_permissions).toContain('https://book.dmm.com/*')
    })

    it('API ベース URL を含む (Chrome の CORS バイパスのため)', () => {
      const manifest = resolveManifest('development')
      // BOOKHUB_API_URL 未設定時のデフォルトは http://localhost:3000/*
      const apiHost = (process.env.BOOKHUB_API_URL || 'http://localhost:3000') + '/*'
      expect(manifest.host_permissions).toContain(apiHost)
    })
  })
})
