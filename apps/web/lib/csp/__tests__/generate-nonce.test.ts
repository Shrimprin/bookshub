import { describe, it, expect } from 'vitest'
import { generateNonce } from '../generate-nonce'

describe('generateNonce', () => {
  it('base64 形式の文字列を返す', () => {
    const nonce = generateNonce()
    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/)
  })

  it('128bit (16 bytes) を base64 エンコードした 24 文字を返す', () => {
    // 16 bytes を base64 すると "...==" 含めて 24 文字 (4 * ceil(16 / 3))
    const nonce = generateNonce()
    expect(nonce).toHaveLength(24)
  })

  it('連続呼び出しで衝突しない', () => {
    const samples = new Set<string>()
    for (let i = 0; i < 100; i++) {
      samples.add(generateNonce())
    }
    expect(samples.size).toBe(100)
  })

  it('btoa できる文字列のみを生成する', () => {
    // base64 デコードして 16 bytes に戻ること
    const nonce = generateNonce()
    const decoded = atob(nonce)
    expect(decoded).toHaveLength(16)
  })
})
