import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Card } from './card'
import { cn } from '../../lib/utils'

export type KpiTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'info'

const toneStyles: Record<KpiTone, { bg: string; icon: string }> = {
  brand: { bg: 'var(--brand-ultra)', icon: 'var(--brand)' },
  success: { bg: 'var(--mint-pale)', icon: 'var(--mint)' },
  warning: { bg: 'var(--amber-pale)', icon: 'var(--amber)' },
  danger: { bg: 'var(--red-pale)', icon: 'var(--red)' },
  neutral: { bg: 'var(--app-bg-subtle)', icon: 'var(--text-muted)' },
  info: { bg: '#eff6ff', icon: '#2563eb' },
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
      className={cn('kpi-card', size === 'sm' ? 'p-3 sm:p-3.5' : 'p-4 sm:p-5', className)}
      data-testid={testId}
    >
      <div className="mb-3 flex items-center gap-2.5">
        <div
          className={cn('rounded-lg', size === 'sm' ? 'p-1.5' : 'p-2')}
          style={{ background: styles.bg }}
        >
          <Icon
            className={cn(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')}
            style={{ color: styles.icon }}
            aria-hidden
          />
        </div>
        <span className="text-xs font-medium leading-snug text-[var(--text-mid)]">{label}</span>
      </div>
      <p
        className={cn(
          'font-bold tabular-nums leading-none tracking-tight text-[var(--text)]',
          size === 'sm' ? 'text-lg sm:text-xl' : 'text-2xl sm:text-[1.75rem]'
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
