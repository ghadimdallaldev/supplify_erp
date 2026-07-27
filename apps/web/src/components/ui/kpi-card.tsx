import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card } from './card'
import { cn } from '../../lib/utils'

export type KpiTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const toneStyles: Record<KpiTone, { accent: string; icon: string }> = {
  brand: { accent: 'var(--brand)', icon: 'var(--brand)' },
  success: { accent: 'var(--mint)', icon: 'var(--mint)' },
  warning: { accent: 'var(--amber)', icon: 'var(--amber)' },
  danger: { accent: 'var(--red)', icon: 'var(--red)' },
  neutral: { accent: 'var(--app-border-mid)', icon: 'var(--text-muted)' },
  info: { accent: '#2563eb', icon: '#2563eb' },
}

export function KpiCard({
  label,
  value,
  description,
  icon: Icon,
  tone = 'brand',
  trend,
  sparkline,
  size = 'md',
  className,
  testId,
}: {
  label: string
  value: ReactNode
  description?: string
  icon: LucideIcon
  tone?: KpiTone
  trend?: ReactNode
  sparkline?: ReactNode
  size?: 'sm' | 'md'
  className?: string
  testId?: string
}) {
  const styles = toneStyles[tone]
  const trendContent = trend ?? sparkline
  return (
    <Card
      className={cn(
        'kpi-card border-l-[3px]',
        size === 'sm' ? 'p-3 sm:p-3.5' : 'p-3.5 xl:p-5',
        className
      )}
      data-testid={testId}
      style={{ borderLeftColor: styles.accent }}
    >
      <div className="mb-2.5 flex items-center gap-2.5 xl:mb-3">
        <div
          className={cn(
            'rounded-md border border-[var(--app-border)] bg-[var(--app-bg-subtle)]',
            size === 'sm' ? 'p-1.5' : 'p-2'
          )}
        >
          <Icon
            className={cn(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')}
            style={{ color: styles.icon }}
            aria-hidden
          />
        </div>
        <span className="text-[11px] font-semibold uppercase leading-snug text-[var(--text-muted)]">
          {label}
        </span>
      </div>
      <p
        className={cn(
          'font-semibold tabular-nums leading-none text-[var(--text)]',
          size === 'sm' ? 'text-lg sm:text-xl' : 'text-xl xl:text-2xl'
        )}
      >
        {value}
      </p>
      {trendContent && <div className="mt-2">{trendContent}</div>}
      {description && (
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)] sm:text-xs">
          {description}
        </p>
      )}
    </Card>
  )
}
