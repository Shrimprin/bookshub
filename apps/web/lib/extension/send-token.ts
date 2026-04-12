// Web アプリから Chrome 拡張機能 (BookHub Extension) へアクセストークンを受け渡すユーティリティ。
// externally_connectable 経由で chrome.runtime.sendMessage(extensionId, ...) を呼ぶ。
//
// 以下のケースでは何もしない (no-op) ことで、ブラウザ互換性とデプロイ時の耐障害性を確保する:
// - chrome グローバルが未定義 (Firefox/Safari/SSR)
// - NEXT_PUBLIC_EXTENSION_ID が未設定 (拡張機能未運用)
// - 拡張機能が未インストール (chrome.runtime.lastError が発生)

type ExternalRequest = { type: 'SET_ACCESS_TOKEN'; token: string } | { type: 'CLEAR_ACCESS_TOKEN' }

declare const chrome:
  | {
      runtime?: {
        sendMessage?: (
          extensionId: string,
          message: ExternalRequest,
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

  const message: ExternalRequest =
    token === null ? { type: 'CLEAR_ACCESS_TOKEN' } : { type: 'SET_ACCESS_TOKEN', token }

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
