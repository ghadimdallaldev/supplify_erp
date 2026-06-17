import { useTranslation } from 'react-i18next'
import { Skeleton } from './skeleton'

export function PageLoading({ label }: { label?: string }) {
  const { t } = useTranslation('common')
  const loadingLabel = label ?? t('loadingPage')

  return (
    <div
      className="flex min-h-[40vh] flex-col gap-4 p-4 md:p-6"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <span className="sr-only">{loadingLabel}</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-24 w-full rounded-lg" />
      <div className="space-y-2">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-14 w-full rounded-lg" />
      </div>
    </div>
  )
}
