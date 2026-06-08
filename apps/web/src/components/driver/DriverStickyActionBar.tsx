import { Button } from '../ui/button'

type Props = {
  primaryLabel: string
  onPrimary: () => void
  onProblem?: () => void
  disabled?: boolean
  primarySuccess?: boolean
}

export function DriverStickyActionBar({
  primaryLabel,
  onPrimary,
  onProblem,
  disabled,
  primarySuccess,
}: Props) {
  return (
    <div
      className="driver-sticky-action-bar fixed inset-x-0 bottom-0 z-40 border-t border-[var(--app-border)] bg-[var(--surface)]/95 px-3 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm sm:hidden"
      data-testid="driver-sticky-action-bar"
    >
      <div className="mx-auto flex max-w-lg flex-col gap-2">
        <Button
          size="lg"
          className={`min-h-[52px] w-full text-base font-semibold ${
            primarySuccess ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''
          }`}
          disabled={disabled}
          onClick={onPrimary}
        >
          {primaryLabel}
        </Button>
        {onProblem ? (
          <Button
            size="lg"
            variant="outline"
            className="min-h-[48px] w-full border-red-200 text-base font-semibold text-red-700 dark:border-red-900 dark:text-red-300"
            disabled={disabled}
            onClick={onProblem}
          >
            Problem
          </Button>
        ) : null}
      </div>
    </div>
  )
}
