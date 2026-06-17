import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { TableScroll } from '../ui/table-scroll'
import { cn } from '../../lib/utils'
import { UsageStatusBadge } from './UsageStatusBadge'
import { UsageProgressBar } from './UsageProgressBar'
import { AdminEmptyState } from './adminUi'
import { formatPlanLimitDisplayValue } from '../../lib/adminPlanLimitLookup'
import type { UsagePressureEntry } from '../../lib/adminTenantUsageMetrics'

function tenantInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2)
}

function tenantTypeTone(type: 'SUPPLIER' | 'RESTAURANT'): string {
  return type === 'SUPPLIER'
    ? 'border-[var(--brand-light)]/40 bg-[var(--brand-pale)] text-[var(--brand)]'
    : 'border-[var(--mint-light)]/50 bg-[var(--mint-pale)] text-[var(--mint)]'
}

export function UsagePressureList({
  entries,
  onDiagnostics,
  onChangePlan,
}: {
  entries: UsagePressureEntry[]
  onDiagnostics?: (target: {
    id: string
    name: string
    tenantType: 'SUPPLIER' | 'RESTAURANT'
  }) => void
  onChangePlan?: (id: string, name: string, tenantType: 'SUPPLIER' | 'RESTAURANT') => void
}) {
  if (entries.length === 0) {
    return (
      <AdminEmptyState
        title="No tenants under pressure"
        description="No loaded tenants are near or over plan limits. Load more tenants or check back later."
      />
    )
  }

  return (
    <TableScroll aria-label="Tenants under usage pressure">
      <table className="w-full min-w-[720px] text-sm" data-testid="admin-usage-pressure-list">
        <thead>
          <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            <th className="px-4 py-3">Tenant</th>
            <th className="px-4 py-3">Type</th>
            <th className="hidden px-4 py-3 sm:table-cell">Plan</th>
            <th className="px-4 py-3">Top pressure</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--app-border)]">
          {entries.map((entry) => {
            const pct = Math.round(entry.pressureScore)
            return (
              <tr
                key={`${entry.tenantType}-${entry.id}`}
                className="transition-colors hover:bg-[var(--brand-ultra)]/35"
              >
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-xs font-semibold text-[var(--brand)]"
                      aria-hidden
                    >
                      {tenantInitials(entry.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--text)]">{entry.name}</p>
                      <p className="truncate text-xs text-[var(--text-mid)]">{entry.topMetric}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <Badge
                    variant="outline"
                    className={cn(
                      'text-[11px] font-medium capitalize',
                      tenantTypeTone(entry.tenantType)
                    )}
                  >
                    {entry.tenantType.toLowerCase()}
                  </Badge>
                </td>
                <td className="hidden px-4 py-3.5 text-sm text-[var(--text-mid)] sm:table-cell">
                  {entry.planLabel}
                </td>
                <td className="px-4 py-3.5">
                  <div className="min-w-[140px] max-w-[220px]">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium tabular-nums text-[var(--text)]">
                        {entry.topUsed} / {formatPlanLimitDisplayValue(entry.topLimit)}
                      </span>
                      <span
                        className={cn(
                          'shrink-0 text-xs font-semibold tabular-nums',
                          entry.status === 'over_limit'
                            ? 'text-[var(--red)]'
                            : entry.status === 'near_limit'
                              ? 'text-[var(--amber)]'
                              : 'text-[var(--text-mid)]'
                        )}
                      >
                        {pct}%
                      </span>
                    </div>
                    <UsageProgressBar
                      used={entry.topUsed}
                      limit={entry.topLimit}
                      status={entry.status}
                      className="mt-1.5"
                    />
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <UsageStatusBadge status={entry.status} />
                </td>
                <td className="px-4 py-3.5 text-right">
                  <div className="flex justify-end gap-1.5">
                    {onDiagnostics && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs"
                        onClick={() =>
                          onDiagnostics({
                            id: entry.id,
                            name: entry.name,
                            tenantType: entry.tenantType,
                          })
                        }
                      >
                        Diagnostics
                      </Button>
                    )}
                    {onChangePlan && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-2.5 text-xs text-[var(--brand-mid)]"
                        onClick={() => onChangePlan(entry.id, entry.name, entry.tenantType)}
                      >
                        Upgrade
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </TableScroll>
  )
}
