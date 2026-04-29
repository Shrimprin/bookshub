export default function BookshelfLoading() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8" aria-busy="true">
      <div className="mb-6 flex items-baseline justify-between">
        <div className="h-7 w-24 animate-pulse rounded bg-muted" />
        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
      </div>
      <div className="mb-6 h-9 w-full max-w-md animate-pulse rounded bg-muted" />
      <ul
        aria-label="読み込み中"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <li key={i} className="aspect-[2/3] animate-pulse rounded bg-muted" />
        ))}
      </ul>
    </main>
  )
}
