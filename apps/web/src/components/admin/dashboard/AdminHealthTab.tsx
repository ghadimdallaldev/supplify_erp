import { Card } from '../../ui/card'
import { useGetAdminOverviewQuery, useGetAdminHealthQuery } from '../../../services/api'
import { AlertCircle, CheckCircle2 } from 'lucide-react'
import { AdminTabLoading } from './adminDashboardShared'

export interface AdminHealthTabProps {
  active: boolean
}

export function AdminHealthTab({ active }: AdminHealthTabProps) {
  const {
    data: overview,
    isLoading: overviewLoading,
    isError: overviewError,
  } = useGetAdminOverviewQuery(undefined, { skip: !active })

  const { data: healthData, isLoading: healthLoading } = useGetAdminHealthQuery(undefined, {
    skip: !active,
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[var(--text)]">System Health</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Platform status, subscription health, upcoming expirations
          </p>
        </div>
      </div>
      {healthLoading || overviewLoading ? <AdminTabLoading /> : null}
      {!overviewLoading && overviewError && (
        <Card className="p-6 border-red-200 bg-red-50/50 mb-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-[var(--text)]">
                Subscription health metrics unavailable
              </p>
              <p className="text-sm text-[var(--text-muted)] mt-1">
                Overview metrics failed to load. Infrastructure checks below may still apply.
              </p>
            </div>
          </div>
        </Card>
      )}
      {!overviewLoading && !overviewError && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
          {[
            {
              label: 'Active',
              value:
                (overview?.subscriptionStats as Record<string, number> | undefined)?.ACTIVE ?? 0,
              color: 'var(--mint)',
              bg: 'var(--mint-pale)',
            },
            {
              label: 'Trialing',
              value:
                (overview?.subscriptionStats as Record<string, number> | undefined)?.TRIALING ?? 0,
              color: 'var(--brand)',
              bg: 'var(--brand-ultra)',
            },
            {
              label: 'Past Due',
              value:
                (overview?.alerts as { pastDueSubscriptions?: number } | undefined)
                  ?.pastDueSubscriptions ??
                (overview?.subscriptionStats as Record<string, number> | undefined)?.PAST_DUE ??
                0,
              color: '#ef4444',
              bg: '#fef2f2',
            },
            {
              label: 'Trials expiring (7d)',
              value:
                (overview?.alerts as { trialsExpiringSoon?: number } | undefined)
                  ?.trialsExpiringSoon ?? 0,
              color: '#f59e0b',
              bg: '#fffbeb',
            },
          ].map(({ label, value, color, bg }) => (
            <Card key={label} className="p-4">
              <p className="text-xs font-medium text-[var(--text-muted)] mb-1">{label}</p>
              <p className="text-2xl font-black" style={{ color }}>
                {value}
              </p>
              <div className="mt-2 h-1 rounded-full" style={{ background: bg }}>
                <div
                  className="h-1 rounded-full"
                  style={{ width: '100%', background: color + '40' }}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
      {!healthLoading && (
        <>
          {healthData?.dbPool ? (
            <Card className="p-5">
              <p className="text-sm font-semibold text-[var(--text)] mb-3">Database Pool</p>
              <div className="grid grid-cols-3 gap-4 text-center">
                {[
                  { label: 'Total', value: healthData.dbPool.total },
                  { label: 'Idle', value: healthData.dbPool.idle, note: 'available' },
                  {
                    label: 'Waiting',
                    value: healthData.dbPool.waiting,
                    alert: healthData.dbPool.waiting > 0,
                  },
                ].map(({ label, value, note, alert }) => (
                  <div
                    key={label}
                    className="rounded-lg p-3"
                    style={{ background: alert ? '#fef2f2' : 'var(--surface-mid)' }}
                  >
                    <p
                      className="text-xl font-black"
                      style={{ color: alert ? '#ef4444' : 'var(--text)' }}
                    >
                      {value}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      {label}
                      {note ? ` (${note})` : ''}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1">
                  <span>Pool utilization</span>
                  <span>
                    {healthData.dbPool.total > 0
                      ? Math.round(
                          ((healthData.dbPool.total - healthData.dbPool.idle) /
                            healthData.dbPool.total) *
                            100
                        )
                      : 0}
                    %
                  </span>
                </div>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: 'var(--app-border)' }}
                >
                  <div
                    className="h-2 rounded-full"
                    style={{
                      width:
                        healthData.dbPool.total > 0
                          ? `${Math.min(100, Math.round(((healthData.dbPool.total - healthData.dbPool.idle) / healthData.dbPool.total) * 100))}%`
                          : '0%',
                      background: 'var(--brand)',
                    }}
                  />
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-5">
              <p className="text-sm font-semibold text-[var(--text)] mb-1">Database Pool</p>
              <p className="text-sm text-[var(--text-muted)]">
                Pool metrics not available from this environment.
              </p>
            </Card>
          )}

          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-[var(--text)]">Recent API Errors</p>
              {!healthData?.recentApiErrors?.length && (
                <span
                  className="flex items-center gap-1 text-xs font-medium"
                  style={{ color: 'var(--mint)' }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />{' '}
                  {healthData ? 'No errors in system_event' : 'Health checks limited'}
                </span>
              )}
            </div>
            {healthData?.emailFailures?.length ? (
              <div className="mb-4">
                <p className="text-sm font-semibold text-[var(--text)] mb-2">
                  Email failures (24h)
                </p>
                <div className="rounded-lg overflow-hidden border border-[var(--app-border)]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: 'var(--surface-mid)' }}>
                        <th className="text-left px-3 py-2">Event</th>
                        <th className="text-left px-3 py-2">Recipient</th>
                        <th className="text-left px-3 py-2">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--app-border)]">
                      {healthData.emailFailures.map((e, i) => (
                        <tr key={e.id || i}>
                          <td className="px-3 py-2">{e.eventType}</td>
                          <td className="px-3 py-2 font-mono">{e.recipientRedacted}</td>
                          <td className="px-3 py-2 truncate max-w-[200px]">
                            {e.errorMessage || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  Job and webhook failure collectors are not configured yet.
                </p>
              </div>
            ) : null}
            {!healthData?.recentApiErrors?.length ? (
              <p className="text-sm text-[var(--text-muted)]">
                {healthData
                  ? 'No errors logged in system_event (requires system_event table). Job/webhook failure tracking is not configured yet.'
                  : 'Health endpoint did not return data.'}
              </p>
            ) : (
              <div className="rounded-lg overflow-hidden border border-[var(--app-border)]">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: 'var(--surface-mid)' }}>
                      <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">
                        Type
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">
                        Source
                      </th>
                      <th className="text-left px-3 py-2 font-medium text-[var(--text-muted)]">
                        Message
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--app-border)]">
                    {healthData.recentApiErrors.map((e, i) => (
                      <tr key={i}>
                        <td className="px-3 py-2 text-red-500 font-medium">{e.type}</td>
                        <td className="px-3 py-2 text-[var(--text-muted)]">{e.source}</td>
                        <td className="px-3 py-2 text-[var(--text)] max-w-[300px] truncate">
                          {e.message}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
