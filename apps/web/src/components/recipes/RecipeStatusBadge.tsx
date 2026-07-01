import { cn } from '../../lib/utils'

const STATUS_STYLES: Record<string, string> = {
  HEALTHY: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  WARNING: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  MISSING_DATA: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
}

const STATUS_LABELS: Record<string, string> = {
  HEALTHY: 'Healthy',
  WARNING: 'Above target',
  MISSING_DATA: 'Missing data',
}

export function RecipeStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_STYLES[status] || 'bg-muted text-muted-foreground'
      )}
    >
      {STATUS_LABELS[status] || status}
    </span>
  )
}
