import { describe, it, expect, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import { syncTokenOnAuthChange } from '../sync-token-on-auth-change'

function makeSession(token: string): Session {
  return {
    access_token: token,
    refresh_token: 'refresh',
    expires_in: 3600,
    expires_at: Date.now() / 1000 + 3600,
    token_type: 'bearer',
    user: {
      id: 'user-id',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '2024-01-01T00:00:00Z',
    },
  }
}

describe('syncTokenOnAuthChange', () => {
  it('SIGNED_IN でアクセストークンを送信する', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await syncTokenOnAuthChange('SIGNED_IN', makeSession('token-1'), send)
    expect(send).toHaveBeenCalledWith('token-1')
  })

  it('TOKEN_REFRESHED でアクセストークンを送信する', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await syncTokenOnAuthChange('TOKEN_REFRESHED', makeSession('token-2'), send)
    expect(send).toHaveBeenCalledWith('token-2')
  })

  it('INITIAL_SESSION でアクセストークンを送信する', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await syncTokenOnAuthChange('INITIAL_SESSION', makeSession('token-3'), send)
    expect(send).toHaveBeenCalledWith('token-3')
  })

  it('INITIAL_SESSION で session が null なら何もしない', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await syncTokenOnAuthChange('INITIAL_SESSION', null, send)
    expect(send).not.toHaveBeenCalled()
  })

  it('SIGNED_OUT で null を送信する (CLEAR_ACCESS_TOKEN)', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await syncTokenOnAuthChange('SIGNED_OUT', null, send)
    expect(send).toHaveBeenCalledWith(null)
  })

  it('USER_UPDATED は無視する', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await syncTokenOnAuthChange('USER_UPDATED', makeSession('token-4'), send)
    expect(send).not.toHaveBeenCalled()
  })

  it('PASSWORD_RECOVERY は無視する', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    await syncTokenOnAuthChange('PASSWORD_RECOVERY', null, send)
    expect(send).not.toHaveBeenCalled()
  })
})
