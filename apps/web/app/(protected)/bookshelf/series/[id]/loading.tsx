import { Skeleton } from '@/components/ui/skeleton'

export default function SeriesDetailLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8" aria-busy="true">
      <Skeleton className="mb-4 h-4 w-32" />
      <div className="mb-6 space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <ul
        aria-label="読み込み中"
        className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6"
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <li key={i}>
            <Skeleton className="aspect-[2/3] w-full" />
          </li>
        ))}
      </ul>
    </main>
  )
}
