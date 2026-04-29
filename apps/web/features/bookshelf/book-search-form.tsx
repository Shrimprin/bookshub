'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Loader2, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface BookSearchFormProps {
  defaultValue: string
}

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2

export function BookSearchForm({ defaultValue }: BookSearchFormProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState(defaultValue)
  const [isPending, startTransition] = useTransition()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // defaultValue と一致する値は URL 由来 (初回 mount やナビゲーション後) なので
    // 再度 router.replace を呼ぶ必要がない。これで StrictMode の二重 mount でも
    // 不要なナビゲーションが走らない。
    if (value === defaultValue) {
      return
    }

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
    }

    timerRef.current = setTimeout(() => {
      const trimmed = value.trim()
      const nextUrl =
        trimmed.length >= MIN_QUERY_LENGTH
          ? `${pathname}?q=${encodeURIComponent(trimmed)}`
          : pathname
      startTransition(() => {
        router.replace(nextUrl)
      })
    }, DEBOUNCE_MS)

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
      }
    }
  }, [value, defaultValue, pathname, router])

  return (
    <div className="mb-6">
      <label htmlFor="bookshelf-search" className="sr-only">
        タイトル・著者で検索
      </label>
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="bookshelf-search"
          type="search"
          placeholder="タイトル・著者で検索 (2 文字以上)"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="pl-9 pr-9"
          aria-busy={isPending}
        />
        {isPending ? (
          <Loader2
            className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        ) : null}
      </div>
    </div>
  )
}
