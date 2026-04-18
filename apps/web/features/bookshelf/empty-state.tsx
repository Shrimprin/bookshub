interface EmptyStateProps {
  variant: 'empty' | 'no-results'
}

export function EmptyState({ variant }: EmptyStateProps) {
  if (variant === 'no-results') {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <p className="text-lg font-medium">検索結果がありません</p>
        <p className="mt-2 text-sm text-muted-foreground">別のキーワードをお試しください</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <p className="text-lg font-medium">蔵書がまだありません</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Chrome 拡張機能から Kindle / DMM の蔵書を取り込んでください
      </p>
    </div>
  )
}
