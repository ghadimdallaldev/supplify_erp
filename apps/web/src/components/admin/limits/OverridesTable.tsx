import { Button } from '../../ui/button'
import { TableScroll } from '../../ui/table-scroll'
import { formatLimitKeyLabel, formatPlanCodeLabel } from '../../../lib/adminLimitLabels'
import { AdminStatusBadge, formatAdminDateTime } from '../adminUi'

export function OverridesTable({
  rows,
  kind,
  tenantName,
  onDisable,
}: {
  rows: Array<Record<string, unknown>>
  kind: 'tenant' | 'plan'
  tenantName?: string
  onDisable: (id: string) => void
}) {
  return (
    <TableScroll aria-label={`${kind} limit overrides`}>
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b bg-[var(--app-bg-subtle)]/50 text-left text-xs text-[var(--text-muted)]">
            {kind === 'plan' && <th className="px-3 py-2">Plan</th>}
            <th className="px-3 py-2">Limit</th>
            <th className="px-3 py-2">Value</th>
            {kind === 'tenant' && <th className="px-3 py-2">Tenant</th>}
            <th className="px-3 py-2">Reason</th>
            <th className="px-3 py-2">Updated</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={String(row.id)} className="hover:bg-[var(--brand-ultra)]/30">
              {kind === 'plan' && (
                <td className="px-3 py-2 font-medium">
                  {formatPlanCodeLabel(String(row.plan_code || ''))}
                </td>
              )}
              <td className="px-3 py-2">{formatLimitKeyLabel(String(row.limit_type))}</td>
              <td className="px-3 py-2">{String(row.override_value)}</td>
              {kind === 'tenant' && (
                <td className="px-3 py-2 text-[var(--text-muted)]">{tenantName ?? '—'}</td>
              )}
              <td className="px-3 py-2 max-w-[12rem] truncate text-[var(--text-muted)]">
                {String(row.reason || '—')}
              </td>
              <td className="px-3 py-2 text-xs text-[var(--text-muted)]">
                {formatAdminDateTime(row.updated_at || row.created_at)}
              </td>
              <td className="px-3 py-2">
                <AdminStatusBadge status={row.is_active === false ? 'inactive' : 'active'} />
              </td>
              <td className="px-3 py-2 text-right">
                {row.is_active !== false && (
                  <Button size="sm" variant="outline" onClick={() => onDisable(String(row.id))}>
                    Disable
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  )
}
