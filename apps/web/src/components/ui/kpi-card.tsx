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
      className={cn('kpi-card', size === 'sm' ? 'p-2.5 sm:p-3' : 'p-3 sm:p-4', className)}
      data-testid={testId}
    >
      <div className="mb-2 flex items-center gap-2">
        <div className="rounded-md p-1.5" style={{ background: styles.bg }}>
          <Icon className="h-3.5 w-3.5" style={{ color: styles.icon }} aria-hidden />
        </div>
        <span className="text-xs font-medium text-[var(--text-muted)]">{label}</span>
      </div>
      <p
        className={cn(
          'font-bold text-[var(--text)]',
          size === 'sm' ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
        )}
      >
        {value}
      </p>
      {trendContent && <div className="mt-1">{trendContent}</div>}
      {description && (
        <p className="mt-1 text-[10px] text-[var(--text-muted)] sm:text-xs">{description}</p>
      )}
    </Card>
  )
}
