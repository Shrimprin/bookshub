'use client'

import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'

import { Button } from '@/components/ui/button'

const subscribe = () => () => {}
const getSnapshot = () => true
const getServerSnapshot = () => false

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  // Avoid hydration mismatch: render a placeholder with the same footprint until mounted.
  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" aria-label="テーマ切替" disabled>
        <Sun className="size-4" aria-hidden="true" />
      </Button>
    )
  }

  const isDark = resolvedTheme === 'dark'
  const nextTheme = isDark ? 'light' : 'dark'
  const label = isDark ? 'ライトモードに切替' : 'ダークモードに切替'

  return (
    <Button variant="ghost" size="icon" aria-label={label} onClick={() => setTheme(nextTheme)}>
      {isDark ? (
        <Sun className="size-4" aria-hidden="true" />
      ) : (
        <Moon className="size-4" aria-hidden="true" />
      )}
    </Button>
  )
}
