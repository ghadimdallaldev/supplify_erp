import { Badge } from '../ui/badge'

export type DeliveryEtaCardProps = {
  primary: string
  secondary?: string | null
  showLowConfidence?: boolean
  unavailableMessage?: string | null
  testId?: string
}

export function DeliveryEtaCard({
  primary,
  secondary,
  showLowConfidence,
  unavailableMessage,
  testId = 'delivery-eta-card',
}: DeliveryEtaCardProps) {
  if (unavailableMessage) {
    return (
      <p
        className={`rounded-lg border px-3 py-2 text-xs ${
          unavailableMessage.includes('delivery location is not set')
            ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100'
            : 'border-[var(--app-border)] text-[var(--text-muted)]'
        }`}
        data-testid={testId}
      >
        {unavailableMessage}
      </p>
    )
  }

  return (
    <div
      className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-muted)]/40 px-3 py-2.5"
      data-testid={testId}
    >
      <p
        className="text-sm font-semibold text-[var(--text-primary)]"
        data-testid={`${testId}-primary`}
      >
        {primary}
      </p>
      {secondary ? (
        <p className="mt-0.5 text-xs text-[var(--text-muted)]" data-testid={`${testId}-secondary`}>
          {secondary}
        </p>
      ) : null}
      {showLowConfidence ? (
        <Badge variant="outline" className="mt-2 text-xs" data-testid={`${testId}-confidence`}>
          Low confidence
        </Badge>
      ) : null}
    </div>
  )
}
