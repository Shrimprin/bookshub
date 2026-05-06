import type { NextVolumeInfo } from '@bookhub/shared'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface NextVolumeBadgeProps {
  info: NextVolumeInfo | null
  className?: string
}

/**
 * シリーズの次巻ステータスをカード上に表示するバッジ。
 *
 *  - released: 緑グロー (neonSecondary) で「次巻発売済」
 *  - scheduled: アクセント色 (neonOutline) で「次巻 MM/DD」 (releaseDate に応じて表記揺れ)
 *  - unknown / null: バッジなし (誤情報を出さない選択)
 */
export function NextVolumeBadge({ info, className }: NextVolumeBadgeProps) {
  if (!info || info.status === 'unknown') return null

  const expected = info.expectedVolumeNumber
  const expectedLabel = expected != null ? `${expected}巻` : '次巻'

  if (info.status === 'released') {
    return (
      <Badge
        variant="neonSecondary"
        className={cn(className)}
        aria-label={`次巻 ${expectedLabel} は発売済`}
      >
        次巻発売済
      </Badge>
    )
  }

  // scheduled
  const label = formatScheduledLabel(info.releaseDate)
  const ariaDate = info.releaseDate ?? '発売日未定'
  return (
    <Badge
      variant="neonOutline"
      className={cn(className)}
      aria-label={`次巻 ${expectedLabel} は ${ariaDate} 発売予定`}
    >
      {label}
    </Badge>
  )
}

function formatScheduledLabel(releaseDate: string | null): string {
  if (!releaseDate) return '次巻予定'

  const fullMatch = releaseDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (fullMatch) {
    return `次巻 ${fullMatch[2]}/${fullMatch[3]}`
  }
  const monthMatch = releaseDate.match(/^(\d{4})-(\d{2})$/)
  if (monthMatch) {
    return `次巻 ${monthMatch[1]}/${monthMatch[2]}`
  }
  const yearMatch = releaseDate.match(/^(\d{4})$/)
  if (yearMatch) {
    return `次巻 ${yearMatch[1]}年`
  }
  return '次巻予定'
}
