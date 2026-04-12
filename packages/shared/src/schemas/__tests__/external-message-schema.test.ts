import { describe, it, expect } from 'vitest'
import {
  externalExtensionMessageSchema,
  setAccessTokenMessageSchema,
  clearAccessTokenMessageSchema,
} from '../external-message-schema'

describe('setAccessTokenMessageSchema', () => {
  it('正常な SET_ACCESS_TOKEN を受理する', () => {
    const result = setAccessTokenMessageSchema.safeParse({
      type: 'SET_ACCESS_TOKEN',
      token: 'abc123',
    })
    expect(result.success).toBe(true)
  })

  it('空文字列のトークンを拒否する', () => {
    const result = setAccessTokenMessageSchema.safeParse({
      type: 'SET_ACCESS_TOKEN',
      token: '',
    })
    expect(result.success).toBe(false)
  })

  it('8192 文字を超えるトークンを拒否する', () => {
    const result = setAccessTokenMessageSchema.safeParse({
      type: 'SET_ACCESS_TOKEN',
      token: 'a'.repeat(8193),
    })
    expect(result.success).toBe(false)
  })

  it('token がない場合は拒否する', () => {
    const result = setAccessTokenMessageSchema.safeParse({
      type: 'SET_ACCESS_TOKEN',
    })
    expect(result.success).toBe(false)
  })
})

describe('clearAccessTokenMessageSchema', () => {
  it('正常な CLEAR_ACCESS_TOKEN を受理する', () => {
    const result = clearAccessTokenMessageSchema.safeParse({
      type: 'CLEAR_ACCESS_TOKEN',
    })
    expect(result.success).toBe(true)
  })
})

describe('externalExtensionMessageSchema', () => {
  it('SET_ACCESS_TOKEN の discriminated union として機能する', () => {
    const result = externalExtensionMessageSchema.safeParse({
      type: 'SET_ACCESS_TOKEN',
      token: 'valid-token',
    })
    expect(result.success).toBe(true)
  })

  it('CLEAR_ACCESS_TOKEN の discriminated union として機能する', () => {
    const result = externalExtensionMessageSchema.safeParse({
      type: 'CLEAR_ACCESS_TOKEN',
    })
    expect(result.success).toBe(true)
  })

  it('不明な type を拒否する', () => {
    const result = externalExtensionMessageSchema.safeParse({
      type: 'UNKNOWN_TYPE',
    })
    expect(result.success).toBe(false)
  })

  it('オブジェクトでない値を拒否する', () => {
    expect(externalExtensionMessageSchema.safeParse(null).success).toBe(false)
    expect(externalExtensionMessageSchema.safeParse('string').success).toBe(false)
    expect(externalExtensionMessageSchema.safeParse(42).success).toBe(false)
  })
})
