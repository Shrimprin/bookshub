// Web 本棚から「Kindle から取り込み」ボタン押下で Chrome 拡張機能 (BookHub Extension) に
// スクレイプ開始を依頼するユーティリティ。externally_connectable 経由で
// chrome.runtime.sendMessage(extensionId, { type: 'TRIGGER_SCRAPE', store: 'kindle' }) を呼ぶ。
//
// 返り値の判別 union は、UI 側で「拡張未インストール → インストール誘導」「進行中 → 待機案内」
// 「設定不備 → 管理者向けメッセージ」と分岐できる粒度を確保する。将来インストール促進モーダル
// 等を差し込む際もこのままの API を使い続けられる。
//
// 拡張側の error 文字列はそのまま UI に出さない (改竄リスク・i18n 揺れ・拡張更新による
// 表記変動に弱い)。代わりに ExternalMessageErrorCode による構造化判定を行う。

import type { ExternalMessageErrorCode } from '@bookhub/shared'

export type TriggerResult =
  | { status: 'sent' }
  | { status: 'no-extension' } // chrome 未定義 / lastError (未インストール扱い)
  | { status: 'misconfigured' } // NEXT_PUBLIC_EXTENSION_ID 未設定
  | { status: 'in-progress' } // 拡張側が ALREADY_IN_PROGRESS を返した
  | { status: 'error'; code?: ExternalMessageErrorCode }

type ExternalRequest = { type: 'TRIGGER_SCRAPE'; store: 'kindle' }

type SendMessageResponse =
  | { success: true }
  | { success: false; error?: string; code?: ExternalMessageErrorCode }

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
          if (response?.code === 'ALREADY_IN_PROGRESS') {
            resolve({ status: 'in-progress' })
            return
          }
          if (response?.code === 'UNSUPPORTED_STORE') {
            resolve({ status: 'misconfigured' })
            return
          }
          resolve({ status: 'error', code: response?.code })
        },
      )
    } catch {
      // 拡張側の生エラー文字列を UI に出さない (改竄リスク回避)
      resolve({ status: 'error' })
    }
  })
}
