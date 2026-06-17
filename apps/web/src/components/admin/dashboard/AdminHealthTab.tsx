import { useMemo, useState } from 'react'
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Database,
  Filter,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react'
import { Button } from '../../ui/button'
import { Badge } from '../../ui/badge'
import { Input } from '../../ui/input'
import { AppPanel, SummaryStrip } from '../../ui/app-panel'
import { TableScroll } from '../../ui/table-scroll'
import { useGetAdminOverviewQuery, useGetAdminHealthQuery } from '../../../services/api'
import {
  AdminEmptyState,
  AdminErrorState,
  AdminLoadingState,
  AdminSectionHeader,
  formatAdminDateTime,
} from '../adminUi'
import { cn } from '../../../lib/utils'

export interface AdminHealthTabProps {
  active: boolean
}

function formatTenantLabel(tenantType?: string, tenantId?: string): string {
  if (!tenantId || tenantId === '-') return '—'
  const type = tenantType && tenantType !== '-' ? `${tenantType}:` : ''
  const shortId = tenantId.length > 8 ? `${tenantId.slice(0, 8)}…` : tenantId
  return `${type}${shortId}`
}

function formatUserLabel(userId?: string, role?: string): string {
  if (!userId || userId === 'anon' || userId === '-') return '—'
  const shortId = userId.length > 8 ? `${userId.slice(0, 8)}…` : userId
  if (role && role !== '-') return `${role} · ${shortId}`
  return shortId
}

function statusCodeTone(code?: number): string {
  if (!code) return 'bg-[var(--app-bg-subtle)] text-[var(--text-mid)] border-[var(--app-border)]'
  if (code >= 500) return 'bg-[var(--red-pale)] text-[var(--red)] border-red-200'
  if (code >= 400) return 'bg-[var(--amber-pale)] text-[var(--amber)] border-amber-200'
  return 'bg-[var(--app-bg-subtle)] text-[var(--text-mid)] border-[var(--app-border)]'
}

export function AdminHealthTab({ active }: AdminHealthTabProps) {
  const [errorSearch, setErrorSearch] = useState('')

  const {
    data: overview,
    isLoading: overviewLoading,
    isFetching: overviewFetching,
    isError: overviewError,
    refetch: refetchOverview,
  } = useGetAdminOverviewQuery(undefined, { skip: !active })

  const {
    data: healthData,
    isLoading: healthLoading,
    isFetching: healthFetching,
    isError: healthError,
    error: healthQueryError,
    refetch: refetchHealth,
  } = useGetAdminHealthQuery(undefined, { skip: !active })

  const isLoading = overviewLoading || healthLoading
  const isFetching = overviewFetching || healthFetching

  const subscriptionStats = overview?.subscriptionStats as Record<string, number> | undefined
  const alerts = overview?.alerts as
    | { pastDueSubscriptions?: number; trialsExpiringSoon?: number }
    | undefined

  const activeCount = subscriptionStats?.ACTIVE ?? 0
  const trialingCount = subscriptionStats?.TRIALING ?? 0
  const pastDueCount = alerts?.pastDueSubscriptions ?? subscriptionStats?.PAST_DUE ?? 0
  const trialsExpiring = alerts?.trialsExpiringSoon ?? 0

  const apiErrors = healthData?.recentApiErrors ?? []
  const emailFailures = healthData?.emailFailures ?? []

  const filteredApiErrors = useMemo(() => {
    const q = errorSearch.trim().toLowerCase()
    if (!q) return apiErrors
    return apiErrors.filter((e) => {
      const haystack = [
        e.method,
        e.statusCode,
        e.type,
        e.source,
        e.requestId,
        e.userId,
        e.role,
        e.tenantId,
        e.tenantType,
        e.message,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [apiErrors, errorSearch])

  const handleRefresh = () => {
    refetchOverview()
    refetchHealth()
  }

  const poolUtilization =
    healthData?.dbPool && healthData.dbPool.total > 0
      ? Math.round(
          ((healthData.dbPool.total - healthData.dbPool.idle) / healthData.dbPool.total) * 100
        )
      : 0

  return (
    <>
      <AdminSectionHeader
        title="System health"
        description="Subscription health, infrastructure metrics, and recent API or email failures."
        action={
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        }
      />

      {isLoading ? (
        <AdminLoadingState label="Loading health metrics…" />
      ) : (
        <>
          {overviewError && (
            <div className="mb-4">
              <AdminErrorState
                title="Subscription health metrics unavailable"
                message="Overview metrics failed to load. Infrastructure checks below may still apply."
                onRetry={() => refetchOverview()}
              />
            </div>
          )}

          {!overviewError && (
            <div className="mb-4">
              <SummaryStrip
                testId="admin-health-subscription-stats"
                metrics={[
                  {
                    label: 'Active',
                    value: activeCount,
                    hint: 'Paid or fully active subscriptions',
                    tone: 'mint',
                  },
                  {
                    label: 'Trialing',
                    value: trialingCount,
                    hint: 'Free trial or sandbox',
                    tone: 'brand',
                  },
                  {
                    label: 'Past due',
                    value: pastDueCount,
                    hint: 'Billing attention needed',
                    tone: pastDueCount > 0 ? 'danger' : 'default',
                  },
                  {
                    label: 'Trials expiring (7d)',
                    value: trialsExpiring,
                    hint: 'Trials ending within a week',
                    tone: trialsExpiring > 0 ? 'amber' : 'default',
                  },
                ]}
              />
            </div>
          )}

          {healthError && (
            <div className="mb-4">
              <AdminErrorState
                title="Health checks unavailable"
                message={
                  (healthQueryError as { data?: { message?: string } })?.data?.message ||
                  'The health API request failed.'
                }
                onRetry={() => refetchHealth()}
              />
            </div>
          )}

          {!healthError && (
            <div className="space-y-4">
              <AppPanel
                title="Database pool"
                description={
                  healthData?.dbPool
                    ? `${poolUtilization}% utilization · ${healthData.dbPool.idle} idle of ${healthData.dbPool.total} connections`
                    : 'Pool metrics not available from this environment'
                }
                testId="admin-health-db-pool"
              >
                {healthData?.dbPool ? (
                  <>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      {[
                        { label: 'Total', value: healthData.dbPool.total },
                        {
                          label: 'Idle',
                          value: healthData.dbPool.idle,
                          note: 'available',
                        },
                        {
                          label: 'Waiting',
                          value: healthData.dbPool.waiting,
                          alert: healthData.dbPool.waiting > 0,
                        },
                      ].map(({ label, value, note, alert }) => (
                        <div
                          key={label}
                          className={cn(
                            'rounded-lg p-3',
                            alert ? 'bg-[var(--red-pale)]' : 'bg-[var(--app-bg-subtle)]'
                          )}
                        >
                          <p
                            className={cn(
                              'text-xl font-semibold tabular-nums',
                              alert ? 'text-[var(--red)]' : 'text-[var(--text)]'
                            )}
                          >
                            {value}
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                            {label}
                            {note ? ` (${note})` : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs text-[var(--text-muted)]">
                        <span>Pool utilization</span>
                        <span>{poolUtilization}%</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[var(--app-border)]">
                        <div
                          className="h-2 rounded-full bg-[var(--brand)]"
                          style={{ width: `${Math.min(100, poolUtilization)}%` }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <AdminEmptyState
                    icon={<Database className="h-8 w-8 text-[var(--text-muted)]" />}
                    title="Pool metrics unavailable"
                    description="Database pool stats are not exposed in this environment."
                  />
                )}
              </AppPanel>

              {emailFailures.length > 0 && (
                <AppPanel
                  title="Email failures (24h)"
                  description={`${emailFailures.length} failed delivery attempt${emailFailures.length === 1 ? '' : 's'}`}
                  testId="admin-health-email-failures"
                >
                  <TableScroll aria-label="Recent email failures">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                          <th className="px-4 py-3">Time</th>
                          <th className="px-4 py-3">Event</th>
                          <th className="hidden px-4 py-3 md:table-cell">Recipient</th>
                          <th className="px-4 py-3">Error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--app-border)]">
                        {emailFailures.map((e, i) => (
                          <tr
                            key={e.id || i}
                            className="transition-colors hover:bg-[var(--brand-ultra)]/35"
                          >
                            <td className="whitespace-nowrap px-4 py-3.5 text-xs text-[var(--text-muted)]">
                              {formatAdminDateTime(e.createdAt)}
                            </td>
                            <td className="px-4 py-3.5">
                              <Badge
                                variant="outline"
                                className="border-amber-200 bg-amber-50 text-xs font-medium text-amber-800"
                              >
                                {e.eventType}
                              </Badge>
                            </td>
                            <td className="hidden px-4 py-3.5 font-mono text-xs md:table-cell">
                              {e.recipientRedacted}
                            </td>
                            <td
                              className="max-w-[240px] truncate px-4 py-3.5 text-[var(--text)]"
                              title={e.errorMessage}
                            >
                              {e.errorMessage || '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableScroll>
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    Job and webhook failure collectors are not configured yet.
                  </p>
                </AppPanel>
              )}

              <AppPanel
                title="Recent API errors"
                description={
                  apiErrors.length === 0
                    ? healthData
                      ? 'No errors logged in system_event'
                      : 'Health endpoint did not return data'
                    : `${filteredApiErrors.length} of ${apiErrors.length} error${apiErrors.length === 1 ? '' : 's'} shown`
                }
                testId="admin-health-api-errors"
                footer={
                  healthFetching && !healthLoading ? (
                    <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Updating…
                    </p>
                  ) : undefined
                }
              >
                {apiErrors.length === 0 ? (
                  <AdminEmptyState
                    icon={
                      healthData ? (
                        <CheckCircle2 className="h-8 w-8 text-[var(--mint)]" />
                      ) : (
                        <Activity className="h-8 w-8 text-[var(--text-muted)]" />
                      )
                    }
                    title={healthData ? 'No recent API errors' : 'Health checks limited'}
                    description={
                      healthData
                        ? 'No errors logged in system_event. Job/webhook failure tracking is not configured yet.'
                        : 'The health endpoint did not return error data for this environment.'
                    }
                  />
                ) : (
                  <>
                    <div className="mb-4 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-4">
                      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                        <Filter className="h-3.5 w-3.5" />
                        Filter errors
                      </div>
                      <div className="relative min-w-0">
                        <Search
                          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
                          aria-hidden
                        />
                        <Input
                          className="h-10 pl-9"
                          placeholder="Search method, status, source, tenant, or message…"
                          value={errorSearch}
                          onChange={(e) => setErrorSearch(e.target.value)}
                          aria-label="Search API errors"
                        />
                      </div>
                    </div>

                    {filteredApiErrors.length === 0 ? (
                      <AdminEmptyState
                        icon={<AlertCircle className="h-8 w-8 text-[var(--text-muted)]" />}
                        title="No errors match your search"
                        description="Try a different keyword or clear the filter."
                        action={
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setErrorSearch('')}
                          >
                            Clear search
                          </Button>
                        }
                      />
                    ) : (
                      <TableScroll aria-label="Recent API errors">
                        <table className="w-full min-w-[880px] text-sm">
                          <thead>
                            <tr className="border-b border-[var(--app-border)] bg-[var(--app-bg-subtle)]/60 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                              <th className="px-4 py-3">Time</th>
                              <th className="px-4 py-3">Method</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="hidden px-4 py-3 lg:table-cell">Source</th>
                              <th className="hidden px-4 py-3 md:table-cell">Request ID</th>
                              <th className="hidden px-4 py-3 xl:table-cell">User</th>
                              <th className="hidden px-4 py-3 lg:table-cell">Tenant</th>
                              <th className="px-4 py-3">Message</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--app-border)]">
                            {filteredApiErrors.map((e, i) => (
                              <tr
                                key={e.id || i}
                                className="transition-colors hover:bg-[var(--brand-ultra)]/35"
                              >
                                <td
                                  className="whitespace-nowrap px-4 py-3.5 text-xs text-[var(--text-muted)]"
                                  title={e.createdAt ? String(e.createdAt) : undefined}
                                >
                                  {formatAdminDateTime(e.createdAt ?? e.created_at)}
                                </td>
                                <td className="px-4 py-3.5 font-mono text-xs text-[var(--text-muted)]">
                                  {e.method || '—'}
                                </td>
                                <td className="px-4 py-3.5">
                                  {e.statusCode ? (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        'font-mono text-xs',
                                        statusCodeTone(e.statusCode)
                                      )}
                                    >
                                      {e.statusCode}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-[var(--text-muted)]">
                                      {e.type || '—'}
                                    </span>
                                  )}
                                </td>
                                <td
                                  className="hidden max-w-[180px] truncate px-4 py-3.5 text-[var(--text-muted)] lg:table-cell"
                                  title={e.source}
                                >
                                  {e.source || '—'}
                                </td>
                                <td
                                  className="hidden max-w-[120px] truncate px-4 py-3.5 font-mono text-xs text-[var(--text-muted)] md:table-cell"
                                  title={e.requestId}
                                >
                                  {e.requestId && e.requestId !== '-' ? e.requestId : '—'}
                                </td>
                                <td
                                  className="hidden max-w-[140px] truncate px-4 py-3.5 text-xs text-[var(--text-muted)] xl:table-cell"
                                  title={
                                    e.userId && e.userId !== 'anon'
                                      ? `${e.role || ''} ${e.userId}`.trim()
                                      : undefined
                                  }
                                >
                                  {formatUserLabel(e.userId, e.role)}
                                </td>
                                <td
                                  className="hidden max-w-[120px] truncate px-4 py-3.5 text-xs text-[var(--text-muted)] lg:table-cell"
                                  title={
                                    e.tenantId && e.tenantId !== '-'
                                      ? `${e.tenantType || ''}:${e.tenantId}`.trim()
                                      : undefined
                                  }
                                >
                                  {formatTenantLabel(e.tenantType, e.tenantId)}
                                </td>
                                <td
                                  className="max-w-[260px] truncate px-4 py-3.5 text-[var(--text)]"
                                  title={e.message}
                                >
                                  {e.message || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </TableScroll>
                    )}
                  </>
                )}
              </AppPanel>
            </div>
          )}
        </>
      )}
    </>
  )
}
