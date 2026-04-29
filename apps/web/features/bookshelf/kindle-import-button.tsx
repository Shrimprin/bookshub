'use client'

import { useState } from 'react'
import type { ExternalMessageErrorCode } from '@bookhub/shared'
import { Button } from '@/components/ui/button'
import { triggerKindleScrape, type TriggerResult } from '@/lib/extension/trigger-kindle-scrape'

// 結果ごとの UX 分岐を一段抽象化することで、将来「インストール誘導モーダル」「管理者向け設定リンク」
// 等を差し込めるようにする (cta フィールド経由)。
type FeedbackKind = 'success' | 'info' | 'warn' | 'error'

interface Feedback {
  kind: FeedbackKind
  message: string
  cta?: { label: string; href: string }
}

// Cyberpunk palette: success → cyan (secondary), warn → magenta (primary), info → muted, error → destructive.
const KIND_CLASSNAME: Record<FeedbackKind, string> = {
  success: 'text-secondary',
  info: 'text-muted-foreground',
  warn: 'text-primary',
  error: 'text-destructive',
}

// 拡張側の error 文字列はそのまま UI に出さない (改竄リスク・i18n 揺れ等)。
// 構造化された error code から localized メッセージへホワイトリストでマップする。
const ERROR_MESSAGE_BY_CODE: Record<ExternalMessageErrorCode, string> = {
  ALREADY_IN_PROGRESS: '取り込みが既に進行中です。完了までお待ちください。',
  UNSUPPORTED_STORE: '現在 Kindle のみ対応しています。',
  TAB_CREATE_FAILED: 'タブの作成に失敗しました。再試行してください。',
  INVALID_ORIGIN: '送信元が許可されていません。',
  INVALID_MESSAGE: 'メッセージ形式が不正です。',
}

const GENERIC_ERROR_MESSAGE = '取り込みに失敗しました。再試行してください。'

function feedbackFor(result: TriggerResult): Feedback {
  switch (result.status) {
    case 'sent':
      return {
        kind: 'success',
        message: 'Kindle ページを背景タブで開き、取り込みを開始しました。完了までお待ちください。',
      }
    case 'in-progress':
      return {
        kind: 'info',
        message: '既に取り込みが進行中です。完了までお待ちください。',
      }
    case 'no-extension':
      return {
        kind: 'warn',
        message:
          'BookHub 拡張機能が見つかりません。インストールするとこのボタンから取り込みが行えます。',
        // 将来 Chrome Web Store の URL に差し替える拡張点
        cta: { label: '拡張機能について', href: '#install-extension' },
      }
    case 'misconfigured':
      return {
        kind: 'warn',
        message: '拡張機能の設定が完了していません。管理者にお問い合わせください。',
      }
    case 'error':
      return {
        kind: 'error',
        message: result.code ? ERROR_MESSAGE_BY_CODE[result.code] : GENERIC_ERROR_MESSAGE,
      }
  }
}

export function KindleImportButton() {
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  const handleClick = async () => {
    setPending(true)
    setFeedback(null)
    const result = await triggerKindleScrape()
    setFeedback(feedbackFor(result))
    setPending(false)
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={handleClick} disabled={pending} variant="neon" size="default">
        {pending ? '送信中…' : 'Kindle から取り込み'}
      </Button>
      {feedback && (
        <p className={`max-w-xs text-right text-xs ${KIND_CLASSNAME[feedback.kind]}`}>
          {feedback.message}
          {feedback.cta && (
            <>
              {' '}
              <a className="underline" href={feedback.cta.href}>
                {feedback.cta.label}
              </a>
            </>
          )}
        </p>
      )}
    </div>
  )
}
