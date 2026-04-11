import { createClientFromToken } from '../auth-helper'

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@supabase/supabase-js'

const mockGetUser = vi.fn()
const mockSupabaseClient = {
  auth: { getUser: mockGetUser },
}

beforeEach(() => {
  vi.mocked(createClient).mockReturnValue(mockSupabaseClient as ReturnType<typeof createClient>)
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
})

describe('createClientFromToken', () => {
  it('有効なトークンでユーザーとクライアントを返す', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com' }
    mockGetUser.mockResolvedValue({ data: { user: mockUser }, error: null })

    const result = await createClientFromToken('valid-token')

    expect(result).not.toBeNull()
    expect(result!.user).toEqual(mockUser)
    expect(result!.supabase).toBe(mockSupabaseClient)
  })

  it('Supabase クライアントを Bearer トークン付きで初期化する', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null })

    await createClientFromToken('my-token')

    expect(createClient).toHaveBeenCalledWith(
      'https://test.supabase.co',
      'test-anon-key',
      expect.objectContaining({
        global: {
          headers: { Authorization: 'Bearer my-token' },
        },
      }),
    )
  })

  it('無効なトークンで null を返す', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token', status: 401 },
    })

    const result = await createClientFromToken('invalid-token')

    expect(result).toBeNull()
  })

  it('空文字トークンで null を返す', async () => {
    const result = await createClientFromToken('')

    expect(result).toBeNull()
    expect(mockGetUser).not.toHaveBeenCalled()
  })
})
