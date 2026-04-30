import { Skeleton } from '@/components/ui/skeleton'

export default function BookshelfLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8" aria-busy="true">
      <div className="mb-4 flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-44" />
      </div>
      <Skeleton className="mb-6 h-10 w-full max-w-md" />
      <ul
        aria-label="読み込み中"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <li key={i}>
            <Skeleton className="aspect-[2/3] w-full" />
          </li>
        ))}
      </ul>
    </main>
  )
}
