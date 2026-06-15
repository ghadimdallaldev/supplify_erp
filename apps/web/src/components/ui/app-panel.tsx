import type { ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function AppPanel({
  title,
  description,
  children,
  footer,
  className,
  testId,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  className?: string
  testId?: string
}) {
  return (
    <section
      data-testid={testId}
      className={cn(
        'overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]',
        className
      )}
    >
      <header className="border-b border-[var(--app-border)] px-4 py-4 sm:px-5">
        <h2 className="text-sm font-semibold text-[var(--text)]">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-xs text-[var(--text-mid)]">{description}</p>
        ) : null}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
      {footer ? (
        <div className="border-t border-[var(--app-border)] px-4 py-3 sm:px-5">{footer}</div>
      ) : null}
    </section>
  )
}

export function SummaryMetric({
  label,
  value,
  hint,
  tone = 'default',
  active,
  onClick,
}: {
  label: string
  value: string | number
  hint?: string
  tone?: 'default' | 'mint' | 'amber' | 'danger' | 'brand'
  active?: boolean
  onClick?: () => void
}) {
  const valueClass =
    tone === 'mint'
      ? 'text-[var(--mint)]'
      : tone === 'amber'
        ? 'text-[var(--amber)]'
        : tone === 'danger'
          ? 'text-[var(--red)]'
          : tone === 'brand'
            ? 'text-[var(--brand-mid)]'
            : 'text-[var(--text)]'

  const content = (
    <>
      <p className="text-xs text-[var(--text-mid)]">{label}</p>
      <p className={cn('mt-0.5 font-medium tabular-nums', valueClass)}>{value}</p>
      {hint ? (
        <p className="mt-0.5 text-[10px] text-[var(--text-mid)] line-clamp-2">{hint}</p>
      ) : null}
    </>
  )

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-mid)] focus-visible:ring-offset-2',
          active && 'rounded-lg bg-[var(--brand-ultra)]/60 px-2 py-1 -mx-2 -my-1',
          !active && 'hover:text-[var(--brand-mid)]'
        )}
      >
        {content}
      </button>
    )
  }

  return <div>{content}</div>
}

export function SummaryStrip({
  metrics,
  testId,
  className,
}: {
  metrics: Array<{
    label: string
    value: string | number
    hint?: string
    tone?: 'default' | 'mint' | 'amber' | 'danger' | 'brand'
    active?: boolean
    onClick?: () => void
  }>
  testId?: string
  className?: string
}) {
  return (
    <section
      data-testid={testId}
      className={cn(
        'rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-4 py-3',
        className
      )}
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        {metrics.map((metric) => (
          <SummaryMetric key={metric.label} {...metric} />
        ))}
      </div>
    </section>
  )
}
