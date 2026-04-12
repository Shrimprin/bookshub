'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { syncTokenOnAuthChange } from '@/lib/extension/sync-token-on-auth-change'

// Chrome 拡張機能 (BookHub) へ Supabase セッションのアクセストークンを同期する。
//
// マウント時に一度 getSession() で初期同期し、以降は onAuthStateChange を購読して
// SIGNED_IN / TOKEN_REFRESHED / SIGNED_OUT イベントで送信する。
//
// 実際の送信ロジックは lib/extension/send-token.ts と sync-token-on-auth-change.ts に
// 分離されており、本コンポーネントは Supabase クライアントとの接続点のみを担う。
// (protected)/layout.tsx に配置することで、認証後の全ページで 1 インスタンスだけ動作する。
export function ExtensionTokenBridge(): null {
  useEffect(() => {
    const supabase = createClient()

    // マウント直後の初期同期 (直接 /bookshelf を開いた場合等)
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        void syncTokenOnAuthChange('INITIAL_SESSION', data.session)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      void syncTokenOnAuthChange(event, session)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  return null
}
