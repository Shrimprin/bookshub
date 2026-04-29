// Web 本棚から「Kindle から取り込み」ボタン押下で Chrome 拡張機能 (BookHub Extension) に
// スクレイプ開始を依頼するユーティリティ。externally_connectable 経由で
// chrome.runtime.sendMessage(extensionId, { type: 'TRIGGER_SCRAPE', store: 'kindle' }) を呼ぶ。
//
// 返り値の判別 union は、UI 側で「拡張未インストール → インストール誘導」「進行中 → 待機案内」
// 「設定不備 → 管理者向けメッセージ」と分岐できる粒度を確保する。将来インストール促進モーダル
// 等を差し込む際もこのままの API を使い続けられる。

export type TriggerResult =
  | { status: 'sent' }
  | { status: 'no-extension' } // chrome 未定義 / lastError (未インストール扱い)
  | { status: 'misconfigured' } // NEXT_PUBLIC_EXTENSION_ID 未設定
  | { status: 'in-progress' } // 拡張側が already_in_progress を返した
  | { status: 'error'; message: string }

type ExternalRequest = { type: 'TRIGGER_SCRAPE'; store: 'kindle' }

type SendMessageResponse = { success: true } | { success: false; error?: string }

declare const chrome:
  | {
      runtime?: {
        sendMessage?: (
          extensionId: string,
          message: ExternalRequest,
          callback?: (response: SendMessageResponse | undefined) => void,
        ) => void
        lastError?: { message?: string } | null
      }
    }
  | undefined

const ALREADY_IN_PROGRESS_MARKER = 'already in progress'

export async function triggerKindleScrape(): Promise<TriggerResult> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
    return { status: 'no-extension' }
  }
  const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID
  if (!extensionId) return { status: 'misconfigured' }

  return new Promise<TriggerResult>((resolve) => {
    try {
      chrome.runtime!.sendMessage!(
        extensionId,
        { type: 'TRIGGER_SCRAPE', store: 'kindle' },
        (response) => {
          if (chrome.runtime?.lastError) {
            resolve({ status: 'no-extension' })
            return
          }
          if (response?.success) {
            resolve({ status: 'sent' })
            return
          }
          const errMsg = response?.error ?? 'unknown error'
          if (errMsg.includes(ALREADY_IN_PROGRESS_MARKER)) {
            resolve({ status: 'in-progress' })
            return
          }
          resolve({ status: 'error', message: errMsg })
        },
      )
    } catch (err) {
      resolve({ status: 'error', message: String(err) })
    }
  })
}
