import Link from 'next/link'
import { BookMarked } from 'lucide-react'

import { KindleImportButton } from '@/features/bookshelf/kindle-import-button'
import { ThemeToggle } from '@/components/theme-toggle'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-4 px-4">
        <Link
          href="/bookshelf"
          aria-label="本棚へ"
          className="group flex items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <span
            className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary shadow-glow-soft transition-shadow group-hover:shadow-glow-primary"
            aria-hidden="true"
          >
            <BookMarked className="size-4" />
          </span>
          <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text font-display text-lg font-bold tracking-wider text-transparent">
            BookHub
          </span>
        </Link>
        <div className="flex items-center gap-2">
          <KindleImportButton />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}
