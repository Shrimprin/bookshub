'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SeriesDetailErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function SeriesDetailError({ error, reset }: SeriesDetailErrorProps) {
  useEffect(() => {
    console.error('[SeriesDetailError]', { digest: error.digest })
  }, [error])

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col items-center justify-center px-4 py-16 text-center">
      <div
        className="mb-4 flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive shadow-glow-soft"
        aria-hidden="true"
      >
        <AlertTriangle className="size-7" />
      </div>
      <h1 className="font-display text-2xl font-bold">シリーズの読み込みに失敗しました</h1>
      <p className="mt-4 text-sm text-muted-foreground">
        一時的なエラーが発生した可能性があります。少し待ってから再試行してください。
      </p>
      {error.digest && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">エラー ID: {error.digest}</p>
      )}
      <Button onClick={reset} variant="neon" className="mt-6">
        再試行
      </Button>
    </main>
  )
}
