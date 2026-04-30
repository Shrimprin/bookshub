import Link from 'next/link'
import { BookMarked, ScanSearch, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'

// LP は静的 prerender ではなく、ログイン状態を反映するため動的レンダリング。
export const dynamic = 'force-dynamic'

const FEATURES = [
  {
    icon: BookMarked,
    title: '蔵書を一元管理',
    description: 'Kindle と DMM の蔵書を Chrome 拡張で自動取り込み、ひとつの本棚で眺める',
  },
  {
    icon: ScanSearch,
    title: '二度買い防止',
    description: 'タイトル・著者で素早く検索。買おうとした本が既に蔵書にあれば即座に判別',
  },
  {
    icon: Sparkles,
    title: 'シリーズで集約',
    description: '巻ごとにバラバラだった購入履歴をシリーズ単位でまとめ、所持巻数を可視化',
  },
] as const

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const isAuthenticated = Boolean(user)

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Radial neon ambience (dark mode shines, light mode is muted). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_hsl(var(--primary)/0.18),_transparent_60%),radial-gradient(circle_at_bottom,_hsl(var(--secondary)/0.12),_transparent_60%)]"
      />
      <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-6 py-24 text-center">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 font-mono text-xs uppercase tracking-widest text-primary shadow-glow-soft">
          <Sparkles className="size-3" aria-hidden="true" />
          for manga heavy readers
        </span>
        <h1 className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text font-display text-5xl font-bold tracking-wider text-transparent sm:text-6xl md:text-7xl">
          BookHub
        </h1>
        <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
          散らばった電子書籍ストアの蔵書を一箇所に。
          <br className="hidden sm:inline" />
          二度買いを防ぎ、本棚を眺める時間そのものを愛でる。
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          {isAuthenticated ? (
            <Button asChild variant="neon" size="lg">
              <Link href="/bookshelf">本棚を開く</Link>
            </Button>
          ) : (
            <Button asChild variant="neon" size="lg">
              <Link href="/login">ログイン / 新規登録</Link>
            </Button>
          )}
        </div>

        <ul className="mt-20 grid w-full grid-cols-1 gap-4 text-left sm:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <li
              key={title}
              className="rounded-lg border border-border/60 bg-card/60 p-5 shadow-glow-soft backdrop-blur-sm"
            >
              <div
                className="mb-3 flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary"
                aria-hidden="true"
              >
                <Icon className="size-5" />
              </div>
              <h2 className="font-display text-base font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
