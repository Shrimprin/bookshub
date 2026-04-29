import { BookOpen, SearchX } from 'lucide-react'

interface EmptyStateProps {
  variant: 'empty' | 'no-results'
}

export function EmptyState({ variant }: EmptyStateProps) {
  const isNoResults = variant === 'no-results'
  const Icon = isNoResults ? SearchX : BookOpen
  const title = isNoResults ? '検索結果がありません' : '蔵書がまだありません'
  const description = isNoResults
    ? '別のキーワードをお試しください'
    : 'Chrome 拡張機能から Kindle / DMM の蔵書を取り込んでください'

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-primary/30 bg-card/40 py-16 text-center">
      <div
        className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary shadow-glow-soft"
        aria-hidden="true"
      >
        <Icon className="size-7" />
      </div>
      <p className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-lg font-semibold text-transparent">
        {title}
      </p>
      <p className="mt-2 max-w-sm px-4 text-sm text-muted-foreground">{description}</p>
    </div>
  )
}
