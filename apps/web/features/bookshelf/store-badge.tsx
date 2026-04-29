import type { Store } from '@bookhub/shared'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const STORE_LABEL: Record<Store, string> = {
  kindle: 'Kindle',
  dmm: 'DMM',
  other: 'その他',
}

// Cyberpunk palette: Kindle = cyan glow, DMM = pink/magenta glow, other = outline-only.
const STORE_VARIANT: Record<Store, 'neon' | 'neonSecondary' | 'neonOutline'> = {
  kindle: 'neonSecondary',
  dmm: 'neon',
  other: 'neonOutline',
}

interface StoreBadgeProps {
  store: Store
  className?: string
}

export function StoreBadge({ store, className }: StoreBadgeProps) {
  const label = STORE_LABEL[store]
  return (
    <Badge
      variant={STORE_VARIANT[store]}
      className={cn(className)}
      aria-label={`購入ストア: ${label}`}
    >
      {label}
    </Badge>
  )
}
