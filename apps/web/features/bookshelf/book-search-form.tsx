'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { usePathname, useRouter } from 'next/navigation'
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
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false
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
  }, [value, pathname, router])

  return (
    <div className="mb-6" aria-busy={isPending}>
      <label htmlFor="bookshelf-search" className="sr-only">
        タイトル・著者で検索
      </label>
      <Input
        id="bookshelf-search"
        type="search"
        placeholder="タイトル・著者で検索 (2 文字以上)"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="max-w-md"
      />
    </div>
  )
}
