import { Skeleton } from './skeleton'

/** Standard loading placeholder for detail pages (replaces full-screen spinners). */
export function DetailPageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-6" data-testid="detail-page-skeleton">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
      <div className="rounded-xl border border-[var(--app-border)] p-4 space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}
