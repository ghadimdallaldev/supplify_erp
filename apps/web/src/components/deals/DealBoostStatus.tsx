import { Badge } from '../ui/badge'
import { Rocket, Clock, AlertCircle } from 'lucide-react'

export type BoostStatus = {
  state: 'none' | 'active' | 'expired' | 'scheduled'
  packageName?: string
  startsAt?: string
  endsAt?: string
  daysRemaining?: number | null
  pricePaid?: number
}

export function DealBoostStatus({ boost }: { boost?: BoostStatus | null }) {
  if (!boost || boost.state === 'none') return null

  if (boost.state === 'active') {
    const endsLabel = boost.endsAt
      ? new Date(boost.endsAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : null
    return (
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Rocket className="h-4 w-4 text-emerald-600" />
          <span className="font-medium text-emerald-800 dark:text-emerald-200">
            Boost active · {boost.packageName || 'Boost'}
          </span>
          <Badge variant="secondary" className="text-xs">
            {boost.daysRemaining != null
              ? `${boost.daysRemaining} day${boost.daysRemaining === 1 ? '' : 's'} left`
              : 'Running'}
          </Badge>
        </div>
        {endsLabel ? (
          <p className="mt-1 text-xs text-[var(--text-muted)]">Active until {endsLabel}</p>
        ) : null}
      </div>
    )
  }

  if (boost.state === 'scheduled') {
    return (
      <div className="rounded-lg border px-3 py-2 text-sm flex items-center gap-2">
        <Clock className="h-4 w-4 text-[var(--text-muted)]" />
        <span className="text-[var(--text-muted)]">
          {boost.packageName} scheduled
          {boost.startsAt ? ` · starts ${new Date(boost.startsAt).toLocaleDateString()}` : ''}
        </span>
      </div>
    )
  }

  if (boost.state === 'expired') {
    return (
      <div className="rounded-lg border border-dashed px-3 py-2 text-sm flex items-center gap-2 text-[var(--text-muted)]">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>
          Boost ended
          {boost.packageName ? ` (${boost.packageName})` : ''}
          {boost.endsAt ? ` · expired ${new Date(boost.endsAt).toLocaleDateString()}` : ''}
        </span>
      </div>
    )
  }

  return null
}
