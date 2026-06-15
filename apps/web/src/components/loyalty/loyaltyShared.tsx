import type { ReactNode } from 'react'
import { Skeleton } from '../ui/skeleton'
import { Switch } from '../ui/switch'
import type { LucideIcon } from 'lucide-react'

export function LoyaltyPanel({
  title,
  description,
  children,
  footer,
}: {
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
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

export function LoyaltySummaryStrip({
  enabled,
  programName,
  earnRate,
  redeemValue,
  minRedeem,
}: {
  enabled: boolean
  programName: string
  earnRate: string
  redeemValue: string
  minRedeem: string
}) {
  return (
    <section
      data-testid="loyalty-program-summary"
      className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-4 py-3"
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
        <div>
          <p className="text-xs text-[var(--text-mid)]">Program</p>
          <p className="mt-0.5 text-sm font-semibold text-[var(--text)]">{programName}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-mid)]">Status</p>
          <p
            className={
              enabled
                ? 'mt-0.5 font-medium text-[var(--mint)]'
                : 'mt-0.5 font-medium text-[var(--text-mid)]'
            }
          >
            {enabled ? 'Active' : 'Off'}
          </p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-mid)]">Earn rate</p>
          <p className="mt-0.5 font-medium tabular-nums text-[var(--text)]">{earnRate}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-mid)]">Redeem value</p>
          <p className="mt-0.5 font-medium tabular-nums text-[var(--text)]">{redeemValue}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-mid)]">Min redeem</p>
          <p className="mt-0.5 font-medium tabular-nums text-[var(--text)]">{minRedeem}</p>
        </div>
      </div>
    </section>
  )
}

export function LoyaltyToggleRow({
  label,
  description,
  icon: Icon,
  checked,
  onCheckedChange,
  id,
}: {
  label: string
  description: string
  icon: LucideIcon
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  id?: string
}) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-[var(--brand-ultra)]/50 sm:px-5">
      <div className="flex min-w-0 gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-mid)]" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--text)]">{label}</p>
          <p className="mt-0.5 text-xs text-[var(--text-mid)]">{description}</p>
        </div>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  )
}

export function LoyaltyFormLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-16 w-full rounded-xl" />
      <section className="overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
        <div className="divide-y divide-[var(--app-border)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 px-4 py-4 sm:px-5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-10 w-full max-w-xs" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
