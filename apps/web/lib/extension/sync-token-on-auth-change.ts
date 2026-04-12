import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { sendTokenToExtension } from './send-token'

// Supabase の onAuthStateChange イベントに応じて拡張機能へトークンを送信するロジック。
// 純粋関数として切り出し、React コンポーネントから独立にテスト可能にする。
export async function syncTokenOnAuthChange(
  event: AuthChangeEvent,
  session: Session | null,
  send: (token: string | null) => Promise<void> = sendTokenToExtension,
): Promise<void> {
  switch (event) {
    case 'INITIAL_SESSION':
    case 'SIGNED_IN':
    case 'TOKEN_REFRESHED':
      if (session?.access_token) {
        await send(session.access_token)
      }
      return
    case 'SIGNED_OUT':
      await send(null)
      return
    default:
      // USER_UPDATED, PASSWORD_RECOVERY 等は無視
      return
  }
}
