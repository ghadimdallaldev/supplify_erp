import { Fragment, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronUp, Filter, Loader2, RefreshCw, Search, Shield } from 'lucide-react'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Input } from '../../ui/input'
import { Select, SelectTrigger } from '../../ui/select'
import { AppPanel } from '../../ui/app-panel'
import { TableScroll } from '../../ui/table-scroll'
import { responsiveDataListClasses } from '../../ui/responsive-data-list'
import { useGetAdminAuditLogsQuery } from '../../../services/api'
import {
  AdminEmptyState,
  AdminLoadingState,
  AdminSectionHeader,
  formatAdminDateTime,
} from '../adminUi'
import { cn } from '../../../lib/utils'

const AUDIT_PAGE_SIZE = 20

type AuditLog = {
  id: string
  action_type?: string
  action_description?: string
  target_entity_type?: string
  target_tenant_id?: string
  target_tenant_type?: string
  admin_name?: string
  created_at: string
  ip_address?: string
  old_value?: unknown
  new_value?: unknown
  metadata?: Record<string, unknown>
}

const ACTION_BADGE_TONES: Record<string, string> = {
  subscription: 'bg-[var(--brand-pale)] text-[var(--brand)] border-[var(--brand)]/20',
  plan: 'bg-[var(--mint-pale)] text-[var(--mint)] border-[color-mix(in_srgb,var(--mint)_35%,transparent)]',
  impersonation: 'bg-[var(--app-bg-subtle)] text-[var(--text)] border-[var(--app-border-mid)]',
  override:
    'bg-[var(--amber-pale)] text-[var(--amber)] border-[color-mix(in_srgb,var(--amber)_35%,transparent)]',
  feature_flag: 'bg-cyan-50 text-cyan-800 border-cyan-200',
  tenant: 'bg-[var(--brand-ultra)] text-[var(--brand-mid)] border-[var(--app-border-mid)]',
  user: 'bg-[var(--app-bg-subtle)] text-[var(--text)] border-[var(--app-border)]',
}

function auditActionTone(actionType?: string): string {
  if (!actionType)
    return 'bg-[var(--app-bg-subtle)] text-[var(--text-mid)] border-[var(--app-border)]'
  const category = actionType.split('.')[0]?.toLowerCase() ?? ''
  return (
    ACTION_BADGE_TONES[category] ??
    ACTION_BADGE_TONES[actionType] ??
    'bg-[var(--app-bg-subtle)] text-[var(--text-mid)] border-[var(--app-border)]'
  )
}

function AuditActionBadge({ actionType }: { actionType?: string }) {
  const { t } = useTranslation('admin')
  return (
    <Badge
      variant="outline"
      className={cn('max-w-[220px] truncate font-medium', auditActionTone(actionType))}
      title={actionType}
    >
      {actionType || t('common.unknown')}
    </Badge>
  )
}

export type AdminAuditTabProps = {
  active: boolean
}

export function AdminAuditTab({ active }: AdminAuditTabProps) {
  const { t } = useTranslation('admin')
  const [auditActionType, setAuditActionType] = useState('all')
  const [auditDateFrom, setAuditDateFrom] = useState('')
  const [auditDateTo, setAuditDateTo] = useState('')
  const [auditSearch, setAuditSearch] = useState('')
  const [auditOffset, setAuditOffset] = useState(0)
  const [auditExpandedId, setAuditExpandedId] = useState<string | null>(null)

  const {
    data: auditLogsData,
    isLoading: auditLoading,
    isFetching: auditFetching,
    refetch: refetchAudit,
  } = useGetAdminAuditLogsQuery(
    {
      limit: AUDIT_PAGE_SIZE,
      offset: auditOffset,
      ...(auditActionType !== 'all' && { actionType: auditActionType }),
      ...(auditDateFrom && { dateFrom: auditDateFrom }),
      ...(auditDateTo && { dateTo: auditDateTo }),
      ...(auditSearch && { search: auditSearch }),
    },
    { skip: !active }
  )

  const logs = (auditLogsData?.logs ?? []) as AuditLog[]
  const total = auditLogsData?.total ?? logs.length
  const page = Math.floor(auditOffset / AUDIT_PAGE_SIZE) + 1
  const pageCount = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE))

  const hasActiveFilters = useMemo(
    () =>
      auditActionType !== 'all' ||
      Boolean(auditDateFrom) ||
      Boolean(auditDateTo) ||
      Boolean(auditSearch.trim()),
    [auditActionType, auditDateFrom, auditDateTo, auditSearch]
  )

  const clearFilters = () => {
    setAuditActionType('all')
    setAuditDateFrom('')
    setAuditDateTo('')
    setAuditSearch('')
    setAuditOffset(0)
    setAuditExpandedId(null)
  }

  return (
    <>
      <AdminSectionHeader
        title={t('audit.title')}
        description={t('audit.description')}
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAudit()}
            disabled={auditFetching}
          >
            {auditFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        }
      />

      <div className="mb-4 rounded-md border border-[var(--app-border)] bg-[var(--surface)] p-4">
        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          <Filter className="h-3.5 w-3.5" />
          {t('common.filters')}
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_auto_auto]">
          <div className="relative min-w-0">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden
            />
            <Input
              className="h-10 pl-9"
              placeholder={t('audit.searchPlaceholder')}
              value={auditSearch}
              onChange={(e) => {
                setAuditSearch(e.target.value)
                setAuditOffset(0)
              }}
              aria-label={t('audit.searchAriaLabel')}
            />
          </div>

          <Select
            value={auditActionType}
            onValueChange={(value) => {
              setAuditActionType(value)
              setAuditOffset(0)
            }}
          >
            <SelectTrigger
              className="h-10 w-full"
              aria-label={t('audit.filterActionTypeAriaLabel')}
            >
              <option value="all">{t('common.allActionTypes')}</option>
              {auditLogsData?.actionTypes?.map((type: string) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </SelectTrigger>
          </Select>

          <div className="flex items-center gap-2">
            <Input
              type="date"
              className="h-10 w-full min-w-[9.5rem] text-sm"
              value={auditDateFrom}
              onChange={(e) => {
                setAuditDateFrom(e.target.value)
                setAuditOffset(0)
              }}
              aria-label={t('audit.fromDateAriaLabel')}
            />
            <span className="shrink-0 text-sm text-[var(--text-muted)]">
              {t('audit.dateRangeTo')}
            </span>
            <Input
              type="date"
              className="h-10 w-full min-w-[9.5rem] text-sm"
              value={auditDateTo}
              onChange={(e) => {
                setAuditDateTo(e.target.value)
                setAuditOffset(0)
              }}
              aria-label={t('audit.toDateAriaLabel')}
            />
          </div>

          {hasActiveFilters && (
            <Button type="button" variant="ghost" size="sm" className="h-10" onClick={clearFilters}>
              {t('common.clear')}
            </Button>
          )}
        </div>
      </div>

      <AppPanel
        title={t('audit.recentEntries')}
        description={
          auditLoading
            ? t('audit.loadingTrail')
            : total > 0
              ? t('audit.entriesPage', { total, page, pageCount })
              : t('audit.totalEntries', { total })
        }
        testId="admin-audit-panel"
      >
        {auditLoading ? (
          <AdminLoadingState label={t('audit.loading')} />
        ) : logs.length === 0 ? (
          <AdminEmptyState
            icon={<Shield className="h-8 w-8 text-[var(--text-muted)]" />}
            title={hasActiveFilters ? t('audit.emptyFilteredTitle') : t('audit.emptyDefaultTitle')}
            description={
              hasActiveFilters
                ? t('audit.emptyFilteredDescription')
                : t('audit.emptyDefaultDescription')
            }
            action={
              hasActiveFilters ? (
                <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                  {t('common.clearFilters')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="space-y-3 lg:hidden">
              {logs.map((log) => (
                <article
                  key={log.id}
                  className="rounded-xl border border-[var(--app-border)] p-4 space-y-2"
                  onClick={() => setAuditExpandedId(auditExpandedId === log.id ? null : log.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <AuditActionBadge actionType={log.action_type} />
                    <time className="text-xs text-[var(--text-muted)]">
                      {formatAdminDateTime(log.created_at)}
                    </time>
                  </div>
                  <p className="text-sm font-medium text-[var(--text)]">{log.admin_name || '—'}</p>
                  {log.action_description && (
                    <p className="text-xs text-[var(--text-mid)] line-clamp-2">
                      {log.action_description}
                    </p>
                  )}
                </article>
              ))}
            </div>
            <TableScroll aria-label={t('audit.tableAriaLabel')} className="hidden lg:block">
              <table className="w-full min-w-[880px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    <th className="px-4 py-3">{t('common.table.action')}</th>
                    <th
                      className={cn('hidden px-4 py-3', responsiveDataListClasses.columnSecondary)}
                    >
                      {t('common.table.target')}
                    </th>
                    <th
                      className={cn('hidden px-4 py-3', responsiveDataListClasses.columnTertiary)}
                    >
                      {t('common.table.description')}
                    </th>
                    <th className="px-4 py-3">{t('common.table.admin')}</th>
                    <th className="px-4 py-3">{t('common.table.time')}</th>
                    <th className="px-4 py-3 w-10" aria-label={t('common.expandRowAriaLabel')} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--app-border)]">
                  {logs.map((log) => {
                    const isExpanded = auditExpandedId === log.id
                    return (
                      <Fragment key={log.id}>
                        <tr
                          className="cursor-pointer transition-colors hover:bg-[var(--brand-ultra)]/35"
                          onClick={() => setAuditExpandedId(isExpanded ? null : log.id)}
                        >
                          <td className="px-4 py-3.5">
                            <AuditActionBadge actionType={log.action_type} />
                          </td>
                          <td
                            className={cn(
                              'hidden px-4 py-3.5',
                              responsiveDataListClasses.columnSecondary
                            )}
                          >
                            {log.target_entity_type ? (
                              <Badge variant="outline" className="text-xs font-normal">
                                {log.target_entity_type}
                              </Badge>
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          <td
                            className={cn(
                              'hidden max-w-[280px] px-4 py-3.5 text-[var(--text-mid)]',
                              responsiveDataListClasses.columnTertiary
                            )}
                          >
                            <span className="line-clamp-2">{log.action_description || '—'}</span>
                          </td>
                          <td className="px-4 py-3.5 font-medium text-[var(--text)]">
                            {log.admin_name || '—'}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3.5 text-xs text-[var(--text-muted)]">
                            {formatAdminDateTime(log.created_at)}
                          </td>
                          <td className="px-4 py-3.5">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
                            )}
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-[var(--app-bg-subtle)]/40">
                            <td colSpan={6} className="px-4 py-4">
                              <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
                                {log.action_description && (
                                  <div>
                                    <p className="mb-1 font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                      {t('common.table.description')}
                                    </p>
                                    <p className="text-sm text-[var(--text)]">
                                      {log.action_description}
                                    </p>
                                  </div>
                                )}
                                {log.target_tenant_id && (
                                  <div>
                                    <p className="mb-1 font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                      {t('common.table.tenant')}
                                    </p>
                                    <p className="font-mono text-sm text-[var(--text)]">
                                      {log.target_tenant_type} · {log.target_tenant_id}
                                    </p>
                                  </div>
                                )}
                                {log.ip_address && (
                                  <div>
                                    <p className="mb-1 font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                      {t('audit.ipAddress')}
                                    </p>
                                    <p className="font-mono text-sm text-[var(--text)]">
                                      {log.ip_address}
                                    </p>
                                  </div>
                                )}
                                {(log.old_value != null || log.new_value != null) && (
                                  <div className="md:col-span-2">
                                    <p className="mb-2 font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                      {t('audit.changeLabel')}
                                    </p>
                                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                      {log.old_value != null && (
                                        <div className="rounded-lg border border-[color-mix(in_srgb,var(--red)_35%,transparent)] bg-[var(--red-pale)]/80 p-3">
                                          <p className="mb-1 font-semibold text-[var(--red)]">
                                            {t('common.table.before')}
                                          </p>
                                          <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[var(--text)]">
                                            {JSON.stringify(log.old_value, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                      {log.new_value != null && (
                                        <div className="rounded-lg border border-[color-mix(in_srgb,var(--mint)_35%,transparent)] bg-[var(--mint-pale)]/80 p-3">
                                          <p className="mb-1 font-semibold text-[var(--mint)]">
                                            {t('common.table.after')}
                                          </p>
                                          <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-[var(--text)]">
                                            {JSON.stringify(log.new_value, null, 2)}
                                          </pre>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                                {log.metadata && Object.keys(log.metadata).length > 0 && (
                                  <div className="md:col-span-2">
                                    <p className="mb-1 font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                                      {t('audit.metadata')}
                                    </p>
                                    <pre className="max-h-24 overflow-auto whitespace-pre-wrap text-[var(--text)]">
                                      {JSON.stringify(log.metadata, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </TableScroll>

            {total > AUDIT_PAGE_SIZE && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] pt-4">
                <p className="text-xs text-[var(--text-muted)]">
                  {t('audit.showingRange', {
                    from: auditOffset + 1,
                    to: Math.min(auditOffset + AUDIT_PAGE_SIZE, total),
                    total,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={auditOffset === 0}
                    onClick={() => {
                      setAuditOffset(Math.max(0, auditOffset - AUDIT_PAGE_SIZE))
                      setAuditExpandedId(null)
                    }}
                  >
                    {t('common.previous')}
                  </Button>
                  <span className="text-sm text-[var(--text-muted)]">
                    {t('activity.pageOf', { page, pageCount })}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={auditOffset + AUDIT_PAGE_SIZE >= total}
                    onClick={() => {
                      setAuditOffset(auditOffset + AUDIT_PAGE_SIZE)
                      setAuditExpandedId(null)
                    }}
                  >
                    {t('common.next')}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </AppPanel>
    </>
  )
}
