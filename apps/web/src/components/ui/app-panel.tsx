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
        <h2 className="text-base font-medium text-[var(--text)]">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-[var(--text-mid)]">{description}</p>
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
      <p className="text-[11px] font-medium uppercase tracking-wide text-[var(--text-mid)]">
        {label}
      </p>
      <p className={cn('mt-1 text-2xl font-semibold tabular-nums leading-none', valueClass)}>
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-xs text-[var(--text-mid)] line-clamp-2">{hint}</p> : null}
    </>
  )

  const shellClass = cn(
    'min-w-0 px-4 py-3.5 sm:px-5',
    onClick &&
      'cursor-pointer transition-colors hover:bg-[var(--app-bg-subtle)]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brand-mid)]',
    active && 'bg-[var(--brand-ultra)]/50'
  )

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(shellClass, 'w-full text-start')}>
        {content}
      </button>
    )
  }

  return <div className={shellClass}>{content}</div>
}

export function SummaryStrip({
  metrics,
  testId,
  className,
  columns,
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
  /** Override responsive column count (defaults to metric count, capped at 4 on small screens) */
  columns?: 2 | 3 | 4 | 5 | 6 | 7 | 8
}) {
  const colCount = columns ?? Math.min(metrics.length, 4)
  const gridColsClass =
    colCount <= 2
      ? 'grid-cols-2'
      : colCount === 3
        ? 'grid-cols-2 sm:grid-cols-3'
        : colCount === 4
          ? 'grid-cols-2 sm:grid-cols-4'
          : colCount === 5
            ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
            : colCount === 6
              ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
              : colCount === 7
                ? 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-7'
                : 'grid-cols-2 sm:grid-cols-4 xl:grid-cols-8'

  return (
    <section
      data-testid={testId}
      className={cn(
        'overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]',
        className
      )}
    >
      <div
        className={cn(
          'grid divide-x divide-y divide-[var(--app-border)] sm:divide-y-0',
          gridColsClass
        )}
      >
        {metrics.map((metric) => (
          <SummaryMetric key={metric.label} {...metric} />
        ))}
      </div>
    </section>
  )
}
