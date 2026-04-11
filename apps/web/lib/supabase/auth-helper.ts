import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

interface AuthResult {
  supabase: SupabaseClient
  user: User
}

export async function createClientFromToken(token: string): Promise<AuthResult | null> {
  if (!token) return null

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  )

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) return null

  return { supabase, user }
}
