// Web アプリから Chrome 拡張機能 (BookHub Extension) へアクセストークンを受け渡すユーティリティ。
// externally_connectable 経由で chrome.runtime.sendMessage(extensionId, ...) を呼ぶ。
//
// 以下のケースでは何もしない (no-op) ことで、ブラウザ互換性とデプロイ時の耐障害性を確保する:
// - chrome グローバルが未定義 (Firefox/Safari/SSR)
// - NEXT_PUBLIC_EXTENSION_ID が未設定 (拡張機能未運用)
// - 拡張機能が未インストール (chrome.runtime.lastError が発生)
// - 送信前 safeParse でメッセージが shared スキーマに反した場合 (warn してスキップ)

import {
  clearAccessTokenMessageSchema,
  setAccessTokenMessageSchema,
  type ClearAccessTokenMessage,
  type SetAccessTokenMessage,
} from '@bookhub/shared'

type SendableMessage = SetAccessTokenMessage | ClearAccessTokenMessage

declare const chrome:
  | {
      runtime?: {
        sendMessage?: (
          extensionId: string,
          message: SendableMessage,
          callback?: (response: unknown) => void,
        ) => void
        lastError?: { message?: string } | null
      }
    }
  | undefined

export async function sendTokenToExtension(token: string | null): Promise<void> {
  const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID
  if (!extensionId) return
  if (typeof chrome === 'undefined') return
  if (!chrome?.runtime?.sendMessage) return

  const parsed =
    token === null
      ? clearAccessTokenMessageSchema.safeParse({ type: 'CLEAR_ACCESS_TOKEN' })
      : setAccessTokenMessageSchema.safeParse({ type: 'SET_ACCESS_TOKEN', token })

  if (!parsed.success) {
    // shared スキーマ違反は呼び出し側に伝播させない (no-op 設計を維持)。
    // path / code を出力して運用時に「token 空」「token 上限超え」を区別可能にする。
    const issue = parsed.error.issues[0]
    console.warn('[sendTokenToExtension] invalid message, skipping send', {
      path: issue?.path,
      code: issue?.code,
    })
    return
  }

  const message = parsed.data

  return new Promise<void>((resolve) => {
    try {
      chrome.runtime!.sendMessage!(extensionId, message, () => {
        // lastError は callback 内で参照することで握りつぶす (Chrome API の仕様)
        void chrome.runtime?.lastError
        resolve()
      })
    } catch {
      // 拡張機能 ID が無効・未インストール等の例外は握りつぶす
      resolve()
    }
  })
}
