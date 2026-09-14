import { Button } from '../ui/button'

type Props = {
  primaryLabel: string
  onPrimary: () => void
  onProblem?: () => void
  disabled?: boolean
  primarySuccess?: boolean
  /** Which delivery the bar acts on, so its target is never ambiguous. */
  targetLabel?: string | null
  problemLabel?: string
}

/**
 * Compact bottom action bar for the driver's next delivery.
 *
 * Kept to a single row: two stacked full-width buttons stood ~130px tall, more than
 * the page reserved for them, so the bar covered the delivery it referred to.
 */
export function DriverStickyActionBar({
  primaryLabel,
  onPrimary,
  onProblem,
  disabled,
  primarySuccess,
  targetLabel,
  problemLabel = 'Problem',
}: Props) {
  return (
    <div
      className="driver-sticky-action-bar fixed inset-x-0 bottom-0 z-40 border-t border-[var(--app-border)] bg-[var(--surface)]/95 px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm sm:hidden"
      data-testid="driver-sticky-action-bar"
    >
      <div className="mx-auto max-w-lg">
        {targetLabel ? (
          <p
            className="mb-1.5 truncate text-center text-xs font-medium text-[var(--text-muted)]"
            data-testid="driver-sticky-action-target"
          >
            {targetLabel}
          </p>
        ) : null}
        <div className="flex items-stretch gap-2">
          <Button
            size="lg"
            className={`min-h-[48px] flex-1 text-base font-semibold ${
              primarySuccess ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
            }`}
            disabled={disabled}
            onClick={onPrimary}
            aria-label={targetLabel ? `${primaryLabel} — ${targetLabel}` : primaryLabel}
          >
            {primaryLabel}
          </Button>
          {onProblem ? (
            <Button
              size="lg"
              variant="outline"
              className="min-h-[48px] shrink-0 basis-[38%] border-red-200 text-sm font-semibold text-red-700 dark:border-red-900 dark:text-red-300"
              disabled={disabled}
              onClick={onProblem}
              aria-label={targetLabel ? `${problemLabel} — ${targetLabel}` : problemLabel}
            >
              {problemLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
