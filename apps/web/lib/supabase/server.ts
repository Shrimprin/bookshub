import { cache } from 'react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// React.cache で同一リクエスト内の createClient() 呼び出しを dedupe する。
// layout と page が独立に createClient() を呼んでも Supabase client と
// auth.getUser() のネットワーク往復を 1 回に抑えられる。
export const createClient = cache(async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Component からの読み取り専用呼び出し時は set が失敗するが無視
          }
        },
      },
    },
  )
})
