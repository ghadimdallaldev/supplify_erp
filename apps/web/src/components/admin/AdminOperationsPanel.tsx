import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Label } from '../ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import {
  useGetAdminOperationalSummaryQuery,
  useGetAdminEmailDeliveryLogsQuery,
  useGetAdminFulfillmentIssuesQuery,
  useGetAdminActiveDeliveriesQuery,
  useGetAdminSuppliersQuery,
  useGetAdminRestaurantsQuery,
} from '../../services/api'
import {
  mapAdminTenantRow,
  type AdminTenantOption,
  type AdminTenantType,
} from '../../lib/adminTenantSearch'
import {
  AdminEmptyState,
  AdminLoadingSkeleton,
  AdminRefreshBar,
  AdminStatusBadge,
  formatAdminDateTime,
} from './adminUi'
import { AlertCircle, Mail, Package, MapPin, ListOrdered } from 'lucide-react'
import { AdminTenantDiagnosticsDrawer } from './AdminTenantDiagnosticsDrawer'
import { AdminTenantPicker } from './AdminTenantPicker'

const EMAIL_STATUS_OPTIONS = ['', 'sent', 'failed', 'skipped', 'log_only']

type OpsSubTab = 'summary' | 'email' | 'inventory' | 'fulfillment' | 'gps'

export function AdminOperationsPanel({
  initialSubTab = 'summary',
  onNavigateDeals,
}: {
  initialSubTab?: OpsSubTab
  onNavigateDeals?: () => void
}) {
  const [subTab, setSubTab] = useState<OpsSubTab>(initialSubTab)
  useEffect(() => {
    setSubTab(initialSubTab)
  }, [initialSubTab])
  const [emailStatus, setEmailStatus] = useState('')
  const [emailOffset, setEmailOffset] = useState(0)
  const [pickerType, setPickerType] = useState<AdminTenantType>('SUPPLIER')
  const [pickerTenantId, setPickerTenantId] = useState('')
  const [diagTenant, setDiagTenant] = useState<AdminTenantOption | null>(null)

  const { data: suppliersData, isLoading: suppliersLoading } = useGetAdminSuppliersQuery({
    limit: 100,
    offset: 0,
  })
  const { data: restaurantsData, isLoading: restaurantsLoading } = useGetAdminRestaurantsQuery({
    limit: 100,
    offset: 0,
  })
  const tenantOptions = useMemo(
    () => [
      ...(suppliersData?.suppliers ?? []).map((s: Record<string, unknown>) =>
        mapAdminTenantRow(s as Parameters<typeof mapAdminTenantRow>[0], 'SUPPLIER')
      ),
      ...(restaurantsData?.restaurants ?? []).map((r: Record<string, unknown>) =>
        mapAdminTenantRow(r as Parameters<typeof mapAdminTenantRow>[0], 'RESTAURANT')
      ),
    ],
    [suppliersData, restaurantsData]
  )

  const {
    data: summaryData,
    isLoading: summaryLoading,
    isFetching: summaryFetching,
    refetch: refetchSummary,
  } = useGetAdminOperationalSummaryQuery()
  const summary = summaryData?.summary

  const {
    data: emailLogsData,
    isLoading: emailLoading,
    refetch: refetchEmail,
  } = useGetAdminEmailDeliveryLogsQuery(
    { limit: 25, offset: emailOffset, status: emailStatus || undefined },
    { skip: subTab !== 'email' }
  )

  const { data: issuesData, isLoading: issuesLoading } = useGetAdminFulfillmentIssuesQuery(
    { limit: 30, offset: 0 },
    { skip: subTab !== 'fulfillment' }
  )

  const { data: deliveriesData, isLoading: deliveriesLoading } = useGetAdminActiveDeliveriesQuery(
    { limit: 30 },
    { skip: subTab !== 'gps' }
  )

  const warnings = Array.isArray(summary?.warnings) ? summary.warnings : []

  const gpsStateLabel = (state: string) => {
    if (state === 'live') return 'Live'
    if (state === 'stale') return 'Stale'
    if (state === 'noGps') return 'No GPS'
    if (state === 'off') return 'Off'
    return state
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--text)]">Operations</h2>
          <p className="text-sm text-[var(--text-muted)]">
            Email, inventory expiry, reorder cadence, fulfillment issues, and GPS delivery health
            (read-only)
          </p>
        </div>
        <AdminRefreshBar
          onRefresh={() => {
            refetchSummary()
            if (subTab === 'email') refetchEmail()
          }}
          refreshing={summaryFetching}
        />
      </div>

      <Card className="p-4">
        <AdminTenantPicker
          tenantType={pickerType}
          onTenantTypeChange={(t) => {
            setPickerType(t)
            setPickerTenantId('')
          }}
          tenants={tenantOptions}
          selectedId={pickerTenantId}
          onSelect={(t) => {
            setPickerTenantId(t?.id ?? '')
            if (t) setDiagTenant(t)
          }}
          loading={suppliersLoading || restaurantsLoading}
        />
      </Card>

      <Tabs key={initialSubTab} value={subTab} onValueChange={(v) => setSubTab(v as OpsSubTab)}>
        <TabsList className="flex w-max gap-0 flex-wrap">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="email">Email</TabsTrigger>
          <TabsTrigger value="inventory">Inventory & reorder</TabsTrigger>
          <TabsTrigger value="fulfillment">Fulfillment</TabsTrigger>
          <TabsTrigger value="gps">GPS & delivery</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-4 mt-4">
          {summaryLoading ? (
            <AdminLoadingSkeleton rows={6} />
          ) : (
            <>
              {warnings.length > 0 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      Warnings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {warnings.map(
                      (w: { id: string; severity: string; message: string; tab?: string }) => (
                        <div
                          key={w.id}
                          className="flex items-center justify-between gap-2 text-sm border-b border-[var(--app-border)] pb-2 last:border-0"
                        >
                          <span>{w.message}</span>
                          <AdminStatusBadge status={w.severity} />
                          {w.tab === 'deals' && onNavigateDeals && (
                            <Button size="sm" variant="ghost" onClick={onNavigateDeals}>
                              Review
                            </Button>
                          )}
                        </div>
                      )
                    )}
                  </CardContent>
                </Card>
              ) : (
                <AdminEmptyState title="No warnings" description="Operational checks look clear." />
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard
                  icon={<Mail className="h-4 w-4" />}
                  label="Email failed (24h)"
                  value={summary?.email?.failed24h ?? 0}
                />
                <MetricCard
                  icon={<Package className="h-4 w-4" />}
                  label="Open fulfillment issues"
                  value={summary?.fulfillment?.openIssues ?? 0}
                />
                <MetricCard
                  icon={<MapPin className="h-4 w-4" />}
                  label="Stale GPS deliveries"
                  value={summary?.gpsDeliveries?.stale ?? 0}
                />
                <MetricCard
                  icon={<ListOrdered className="h-4 w-4" />}
                  label="Expired inventory lots"
                  value={summary?.expiry?.expiredLots ?? 0}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <ConfigCard title="Email">
                  <p>Enabled: {summary?.email?.enabled ? 'Yes' : 'No'}</p>
                  <p>Log-only: {summary?.email?.logOnly ? 'Yes' : 'No'}</p>
                  <p>Provider: {summary?.email?.providerLabel ?? '—'}</p>
                  <p>Configured: {summary?.email?.providerConfigured ? 'Yes' : 'No'}</p>
                </ConfigCard>
                <ConfigCard title="GPS & privacy">
                  <p>Platform GPS: {summary?.gps?.platformGpsEnabled ? 'On' : 'Off'}</p>
                  <p>
                    Restaurant tracking:{' '}
                    {summary?.gps?.restaurantTrackingAllowed ? 'Allowed' : 'Disabled'}
                  </p>
                  <p>Driver name visible: {summary?.gps?.showDriverName ? 'Yes' : 'No'}</p>
                  <p>Driver phone visible: {summary?.gps?.showDriverPhone ? 'Yes' : 'No'}</p>
                </ConfigCard>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="email" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <Label className="text-xs">Status</Label>
              <select
                className="mt-1 block rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-2 py-1.5 text-sm"
                value={emailStatus}
                onChange={(e) => {
                  setEmailStatus(e.target.value)
                  setEmailOffset(0)
                }}
              >
                {EMAIL_STATUS_OPTIONS.map((s) => (
                  <option key={s || 'all'} value={s}>
                    {s || 'All'}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {emailLoading ? (
            <AdminLoadingSkeleton rows={6} />
          ) : !emailLogsData?.logs?.length ? (
            <AdminEmptyState
              title="No email logs"
              description="No delivery log entries match filters."
            />
          ) : (
            <div className="rounded-lg border border-[var(--app-border)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-mid)]">
                    <th className="text-left px-3 py-2">Time</th>
                    <th className="text-left px-3 py-2">Tenant</th>
                    <th className="text-left px-3 py-2">Event</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Recipient</th>
                  </tr>
                </thead>
                <tbody>
                  {emailLogsData.logs.map((row: Record<string, unknown>) => (
                    <tr key={String(row.id)} className="border-t border-[var(--app-border)]">
                      <td className="px-3 py-2 text-[var(--text-muted)]">
                        {formatAdminDateTime(row.createdAt as string)}
                      </td>
                      <td className="px-3 py-2">{String(row.tenantName || row.tenantId || '—')}</td>
                      <td className="px-3 py-2">{String(row.eventType)}</td>
                      <td className="px-3 py-2">
                        <AdminStatusBadge status={String(row.status)} />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {String(row.recipientRedacted)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {emailLogsData && emailLogsData.total > 25 && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={emailOffset === 0}
                onClick={() => setEmailOffset(Math.max(0, emailOffset - 25))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={emailOffset + 25 >= (emailLogsData.total || 0)}
                onClick={() => setEmailOffset(emailOffset + 25)}
              >
                Next
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="inventory" className="mt-4">
          {summaryLoading ? (
            <AdminLoadingSkeleton rows={4} />
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              <Card className="p-4">
                <CardTitle className="text-base mb-2">Expiry inventory</CardTitle>
                <ul className="text-sm space-y-1 text-[var(--text-muted)]">
                  <li>Restaurants with lots: {summary?.expiry?.restaurantsWithLots ?? 0}</li>
                  <li>Expiring in 7 days: {summary?.expiry?.expiring7d ?? 0}</li>
                  <li>Expired lots: {summary?.expiry?.expiredLots ?? 0}</li>
                  <li>Reminders sent today: {summary?.expiry?.remindersToday ?? 0}</li>
                </ul>
              </Card>
              <Card className="p-4">
                <CardTitle className="text-base mb-2">Reorder cadence</CardTitle>
                <ul className="text-sm space-y-1 text-[var(--text-muted)]">
                  <li>Active patterns: {summary?.reorder?.activeCadencePatterns ?? 0}</li>
                  <li>Reminders today: {summary?.reorder?.missedRemindersToday ?? 0}</li>
                  <li>Restaurants with cadence: {summary?.reorder?.restaurantsAtRisk ?? 0}</li>
                </ul>
              </Card>
              <Card className="p-4 md:col-span-2">
                <CardTitle className="text-base mb-2">Quick lists</CardTitle>
                <ul className="text-sm space-y-1 text-[var(--text-muted)]">
                  <li>Total lists: {summary?.quickLists?.totalLists ?? 0}</li>
                  <li>Scheduled: {summary?.quickLists?.scheduledLists ?? 0}</li>
                  <li>Restaurants using: {summary?.quickLists?.restaurantsUsing ?? 0}</li>
                  <li>Branch-scoped: {summary?.quickLists?.branchScopedLists ?? 0}</li>
                </ul>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="fulfillment" className="mt-4">
          {issuesLoading ? (
            <AdminLoadingSkeleton rows={5} />
          ) : !issuesData?.issues?.length ? (
            <AdminEmptyState
              title="No open fulfillment issues"
              description="Shortage and substitution issues awaiting resolution will appear here."
            />
          ) : (
            <div className="rounded-lg border border-[var(--app-border)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-mid)]">
                    <th className="text-left px-3 py-2">Order</th>
                    <th className="text-left px-3 py-2">Supplier</th>
                    <th className="text-left px-3 py-2">Restaurant</th>
                    <th className="text-left px-3 py-2">Type</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">Chat</th>
                  </tr>
                </thead>
                <tbody>
                  {issuesData.issues.map((row: Record<string, unknown>) => (
                    <tr key={String(row.id)} className="border-t border-[var(--app-border)]">
                      <td className="px-3 py-2 font-mono text-xs">{String(row.orderRef)}</td>
                      <td className="px-3 py-2">{String(row.supplierName)}</td>
                      <td className="px-3 py-2">{String(row.restaurantName)}</td>
                      <td className="px-3 py-2">{String(row.issueType)}</td>
                      <td className="px-3 py-2">{String(row.status)}</td>
                      <td className="px-3 py-2">{row.hasChat ? 'Yes' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="gps" className="mt-4 space-y-4">
          {summaryLoading ? (
            <AdminLoadingSkeleton rows={2} />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
              <MetricCard label="Active" value={summary?.gpsDeliveries?.active ?? 0} />
              <MetricCard label="Live" value={summary?.gpsDeliveries?.live ?? 0} />
              <MetricCard label="Stale" value={summary?.gpsDeliveries?.stale ?? 0} />
              <MetricCard label="No GPS" value={summary?.gpsDeliveries?.noGps ?? 0} />
              <MetricCard label="Failed today" value={summary?.gpsDeliveries?.failedToday ?? 0} />
            </div>
          )}
          {deliveriesLoading ? (
            <AdminLoadingSkeleton rows={4} />
          ) : !deliveriesData?.deliveries?.length ? (
            <p className="text-sm text-[var(--text-muted)]">No in-progress deliveries right now.</p>
          ) : (
            <div className="rounded-lg border border-[var(--app-border)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-mid)]">
                    <th className="text-left px-3 py-2">Order</th>
                    <th className="text-left px-3 py-2">Supplier</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2">GPS</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveriesData.deliveries.map((row: Record<string, unknown>) => (
                    <tr key={String(row.orderId)} className="border-t border-[var(--app-border)]">
                      <td className="px-3 py-2 font-mono text-xs">{String(row.orderRef)}</td>
                      <td className="px-3 py-2">{String(row.supplierName)}</td>
                      <td className="px-3 py-2">{String(row.deliveryStatus)}</td>
                      <td className="px-3 py-2">
                        <AdminStatusBadge status={gpsStateLabel(String(row.gpsState))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-[var(--text-muted)]">
            Admin view shows delivery state only — no maps or GPS ping history.
          </p>
        </TabsContent>
      </Tabs>

      {diagTenant && (
        <AdminTenantDiagnosticsDrawer
          open={Boolean(diagTenant)}
          onOpenChange={(open) => {
            if (!open) setDiagTenant(null)
          }}
          tenantId={diagTenant.id}
          tenantType={diagTenant.tenantType}
          tenantName={diagTenant.name}
        />
      )}
    </div>
  )
}

function MetricCard({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode
  label: string
  value: number | string
}) {
  return (
    <Card className="p-4">
      {icon && <div className="mb-2 text-[var(--brand)]">{icon}</div>}
      <p className="text-xs text-[var(--text-muted)]">{label}</p>
      <p className="text-2xl font-bold text-[var(--text)]">{value}</p>
    </Card>
  )
}

function ConfigCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="font-semibold text-[var(--text)] mb-2">{title}</p>
      <div className="space-y-1 text-[var(--text-muted)]">{children}</div>
    </Card>
  )
}
