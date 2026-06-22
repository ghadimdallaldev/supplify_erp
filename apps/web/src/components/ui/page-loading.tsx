import { useTranslation } from 'react-i18next'
import { Skeleton } from './skeleton'

/**
 * Route-transition fallback shown while a lazy page chunk loads. Shaped to mirror
 * the app's dominant layout — a page header (title + action) over a filter bar and
 * a table — so the real page appears to snap into place instead of flashing a
 * generic placeholder. Pages with a distinct shape (e.g. the dashboard) provide
 * their own skeleton once their chunk has loaded.
 */
export function PageLoading({ label }: { label?: string }) {
  const { t } = useTranslation('common')
  const loadingLabel = label ?? t('loadingPage')

  return (
    <div
      className="flex w-full flex-col gap-5 p-4 md:p-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{loadingLabel}</span>

      {/* Page header: title + lead text, with a primary action on the right */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-32 shrink-0 rounded-lg" />
      </div>

      {/* Filter / action bar */}
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
        <Skeleton className="h-9 w-24 rounded-lg" />
      </div>

      {/* Table: header strip + rows */}
      <div className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
        <Skeleton className="h-11 w-full rounded-none" />
        <div className="divide-y divide-[var(--app-border)]">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="hidden h-4 w-24 sm:block" />
              <Skeleton className="hidden h-4 w-20 md:block" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
