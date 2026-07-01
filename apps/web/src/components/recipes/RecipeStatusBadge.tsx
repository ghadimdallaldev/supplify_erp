import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'

const STATUS_STYLES: Record<string, string> = {
  HEALTHY: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  WARNING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  MISSING_DATA: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
}

export function RecipeStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation('recipes')
  const label =
    status === 'HEALTHY' || status === 'WARNING' || status === 'MISSING_DATA'
      ? t(`status.${status}`)
      : status

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_STYLES[status] || 'bg-muted text-muted-foreground'
      )}
    >
      {label}
    </span>
  )
}
