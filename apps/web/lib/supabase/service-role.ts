import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Supabase service-role client。`series` テーブル等 RLS で UPDATE が deny されている
 * 行を Server-side からのみ更新するために使う。
 *
 * **重要**:
 *  - サーバサイド (route handler / cron / server action 内) からのみ呼ぶこと。
 *  - SUPABASE_SERVICE_ROLE_KEY は absolutely secret。クライアントバンドルに
 *    流出すると全テーブルの全行を読み書き可能になる。NEXT_PUBLIC_ 接頭辞の
 *    付かない env 名を強制し、Edge Runtime の同名 binding 経由で受け取る。
 *  - cookies / session を持たないため、auth.uid() は常に NULL になる。
 *    呼び元で明示的に user_id 等の所有確認が必要 (本プロジェクトでは
 *    server side でのみ呼ぶため、authenticated context で所有確認済の値を
 *    そのまま使う前提)。
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not configured')
  if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
