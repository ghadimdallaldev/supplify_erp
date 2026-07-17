import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/button'
import { TableScroll } from '../../ui/table-scroll'
import { responsiveDataListClasses } from '../../ui/responsive-data-list'
import { cn } from '../../../lib/utils'
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
  const { t } = useTranslation('admin')
  return (
    <>
      <div className="space-y-3 lg:hidden">
        {rows.map((row) => (
          <article
            key={String(row.id)}
            className="rounded-xl border border-[var(--app-border)] p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium">{formatLimitKeyLabel(String(row.limit_type))}</p>
              <AdminStatusBadge status={row.is_active === false ? 'inactive' : 'active'} />
            </div>
            <p className="text-sm">
              Value: {String(row.override_value)}
              {kind === 'plan' && row.plan_code
                ? ` · ${formatPlanCodeLabel(String(row.plan_code), String(row.tenant_type || ''))}`
                : ''}
            </p>
            {row.is_active !== false && (
              <Button size="sm" variant="outline" onClick={() => onDisable(String(row.id))}>
                Disable
              </Button>
            )}
          </article>
        ))}
      </div>
      <TableScroll aria-label={`${kind} limit overrides`} className="hidden lg:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b bg-[var(--app-bg-subtle)]/50 text-start text-xs text-[var(--text-muted)]">
              {kind === 'plan' && (
                <th className={cn('px-3 py-2', responsiveDataListClasses.columnSecondary)}>
                  {t('common.table.plan')}
                </th>
              )}
              <th className="px-3 py-2">Limit</th>
              <th className="px-3 py-2">Value</th>
              {kind === 'tenant' && (
                <th className={cn('px-3 py-2', responsiveDataListClasses.columnTertiary)}>
                  {t('common.table.tenant')}
                </th>
              )}
              <th className={cn('px-3 py-2', responsiveDataListClasses.columnTertiary)}>Reason</th>
              <th className={cn('px-3 py-2', responsiveDataListClasses.columnSecondary)}>
                Updated
              </th>
              <th className={cn('px-3 py-2', responsiveDataListClasses.columnSecondary)}>
                {t('common.table.status')}
              </th>
              <th className="px-3 py-2 text-end">{t('common.table.actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row) => (
              <tr key={String(row.id)} className="hover:bg-[var(--brand-ultra)]/30">
                {kind === 'plan' && (
                  <td
                    className={cn(
                      'px-3 py-2 font-medium',
                      responsiveDataListClasses.columnSecondary
                    )}
                  >
                    {formatPlanCodeLabel(
                      String(row.plan_code || ''),
                      String(row.tenant_type || '')
                    )}
                  </td>
                )}
                <td className="px-3 py-2">{formatLimitKeyLabel(String(row.limit_type))}</td>
                <td className="px-3 py-2">{String(row.override_value)}</td>
                {kind === 'tenant' && (
                  <td
                    className={cn(
                      'px-3 py-2 text-[var(--text-muted)]',
                      responsiveDataListClasses.columnTertiary
                    )}
                  >
                    {tenantName ?? '—'}
                  </td>
                )}
                <td
                  className={cn(
                    'px-3 py-2 max-w-[12rem] truncate text-[var(--text-muted)]',
                    responsiveDataListClasses.columnTertiary
                  )}
                >
                  {String(row.reason || '—')}
                </td>
                <td
                  className={cn(
                    'px-3 py-2 text-xs text-[var(--text-muted)]',
                    responsiveDataListClasses.columnSecondary
                  )}
                >
                  {formatAdminDateTime(row.updated_at || row.created_at)}
                </td>
                <td className={cn('px-3 py-2', responsiveDataListClasses.columnSecondary)}>
                  <AdminStatusBadge status={row.is_active === false ? 'inactive' : 'active'} />
                </td>
                <td className="px-3 py-2 text-end">
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
    </>
  )
}
