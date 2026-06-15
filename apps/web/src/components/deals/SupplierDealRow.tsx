import { BarChart3, Megaphone, Send, Tag, Trash2 } from 'lucide-react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { StatusBadge } from '../ui/status-badge'
import { DealBoostStatus, type BoostStatus } from './DealBoostStatus'
import { formatDealStatusLabel, formatDealTypeLabel } from '../../lib/dealDisplayLabels'
import { cn } from '../../lib/utils'

type PromotionRecord = Record<string, unknown>

function formatDiscountChip(p: PromotionRecord) {
  const type = String(p.type || '')
  const val = p.discount_value
  if (val == null) return formatDealTypeLabel(type)
  if (type === 'percentage_discount' || type === 'percentage_off') return `${val}%`
  if (type === 'fixed_discount' || type === 'fixed_off') return `$${val}`
  if (type === 'free_shipping') return 'Free ship'
  return formatDealTypeLabel(type)
}

type SupplierDealRowProps = {
  promotion: PromotionRecord
  readOnly?: boolean
  onSubmit: (id: string, name: string) => void
  onDelete: (id: string) => void
  onPause: (id: string) => void
  onResume: (id: string) => void
  onAnalytics: (id: string) => void
}

export function SupplierDealRow({
  promotion: p,
  readOnly = false,
  onSubmit,
  onDelete,
  onPause,
  onResume,
  onAnalytics,
}: SupplierDealRowProps) {
  const id = String(p.id)
  const status = String(p.status)
  const boostStatus = (p.boost_status as BoostStatus | undefined) || null
  const discountChip = formatDiscountChip(p)

  return (
    <article className="group px-4 py-4 transition-colors hover:bg-[var(--brand-ultra)]/50 sm:px-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 gap-3">
          <div
            aria-hidden
            className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-[var(--brand-pale)] text-[var(--brand-mid)]"
          >
            <span className="text-xs font-bold leading-none">{discountChip}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-sm font-semibold text-[var(--text)]">
                {String(p.name)}
              </h3>
              <StatusBadge status={status} label={formatDealStatusLabel(p.status)} />
              {p.is_promoted ? (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Megaphone className="h-3 w-3" />
                  Sponsored
                </Badge>
              ) : null}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--text-mid)]">
              <Tag className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
              <span>{formatDealTypeLabel(p.type)}</span>
              {p.discount_value != null ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="font-medium text-[var(--brand-mid)]">
                    {p.type === 'percentage_discount'
                      ? `${p.discount_value}% off`
                      : `$${p.discount_value} off`}
                  </span>
                </>
              ) : null}
            </p>
            {status === 'rejected' && p.rejection_reason ? (
              <p className="mt-2 text-xs text-[var(--red)]">
                Rejected: {String(p.rejection_reason)}
              </p>
            ) : null}
            {p.boost_pricing_key &&
            (status === 'pending_approval' || status === 'pending_admin_approval') ? (
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Boost ${Number(p.boost_price_snapshot || 0).toFixed(0)} ·{' '}
                {String(p.boost_duration_days)} day
                {Number(p.boost_duration_days) === 1 ? '' : 's'}
              </p>
            ) : null}
            {status === 'approved_pending_payment' ? (
              <p className="mt-1 text-xs font-medium text-[var(--amber)]">
                Awaiting boost payment to go live
              </p>
            ) : null}
          </div>
        </div>

        {!readOnly ? (
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
            {status === 'draft' && (
              <>
                <Button size="sm" onClick={() => onSubmit(id, String(p.name))}>
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Submit with boost
                </Button>
                <Button size="sm" variant="outline" onClick={() => onDelete(id)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Delete
                </Button>
              </>
            )}
            {status === 'active' && (
              <>
                <Button size="sm" variant="outline" onClick={() => onPause(id)}>
                  Pause
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0"
                  onClick={() => onAnalytics(id)}
                  aria-label="View analytics"
                >
                  <BarChart3 className="h-4 w-4" />
                </Button>
              </>
            )}
            {status === 'paused' && (
              <Button size="sm" onClick={() => onResume(id)}>
                Resume
              </Button>
            )}
            {(status === 'rejected' || status === 'expired') && (
              <Button size="sm" variant="outline" onClick={() => onSubmit(id, String(p.name))}>
                Boost again
              </Button>
            )}
          </div>
        ) : null}
      </div>

      {boostStatus ? (
        <div className="mt-3">
          <DealBoostStatus boost={boostStatus} />
        </div>
      ) : null}
    </article>
  )
}

export const DEAL_STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'approved_pending_payment', label: 'Awaiting payment' },
  { value: 'active', label: 'Live' },
  { value: 'paused', label: 'Paused' },
  { value: 'expired', label: 'Expired' },
] as const

export function DealsStatusFilter({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div
      className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none"
      role="tablist"
      aria-label="Filter deals by status"
    >
      {DEAL_STATUS_FILTERS.map((filter) => {
        const active = value === filter.value
        return (
          <button
            key={filter.value || 'all'}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(filter.value)}
            className={cn(
              'shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              active
                ? 'bg-[var(--brand-mid)] text-white'
                : 'text-[var(--text-mid)] hover:bg-[var(--brand-ultra)] hover:text-[var(--text)]'
            )}
          >
            {filter.label}
          </button>
        )
      })}
    </div>
  )
}
