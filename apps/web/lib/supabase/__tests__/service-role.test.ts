import { createServiceRoleClient } from '../service-role'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createServiceRoleClient', () => {
  it('SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が両方そろっていれば client を返す', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srv-key')

    const client = createServiceRoleClient()
    expect(client).toBeDefined()
    expect(client.from).toBeTypeOf('function')
  })

  it('SUPABASE_SERVICE_ROLE_KEY が未設定なら throw する', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')

    expect(() => createServiceRoleClient()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('NEXT_PUBLIC_SUPABASE_URL が未設定なら throw する', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'srv-key')

    expect(() => createServiceRoleClient()).toThrow(/NEXT_PUBLIC_SUPABASE_URL/)
  })
})
