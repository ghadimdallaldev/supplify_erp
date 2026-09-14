import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Label } from '../ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { Select, SelectTrigger } from '../ui/select'
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
  AdminSectionHeader,
  AdminStatusBadge,
  formatAdminDateTime,
} from './adminUi'
import { AlertCircle, Mail, Package, MapPin, ListOrdered } from 'lucide-react'
import { AdminTenantDiagnosticsDrawer } from './AdminTenantDiagnosticsDrawer'
import { AdminTenantPicker } from './AdminTenantPicker'
import { AdminSupportChatPanel } from './AdminSupportChatPanel'
import { AdminFeaturedPlacementsPanel } from './AdminFeaturedPlacementsPanel'

const EMAIL_STATUS_OPTIONS = ['', 'sent', 'failed', 'skipped', 'log_only']

type OpsSubTab = 'summary' | 'email' | 'inventory' | 'fulfillment' | 'gps'

export function AdminOperationsPanel({
  initialSubTab = 'summary',
  onNavigateDeals,
}: {
  initialSubTab?: OpsSubTab
  onNavigateDeals?: () => void
}) {
  const { t } = useTranslation('admin')
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
    const key = `operations.gpsState.${state}` as const
    const translated = t(key, { defaultValue: '' })
    if (translated) return translated
    return state
  }

  return (
    <div className="space-y-4">
      <AdminSectionHeader
        title={t('operations.title')}
        description={t('operations.description')}
        action={
          <AdminRefreshBar
            onRefresh={() => {
              refetchSummary()
              if (subTab === 'email') refetchEmail()
            }}
            refreshing={summaryFetching}
          />
        }
      />

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

      <AdminSupportChatPanel />

      <AdminFeaturedPlacementsPanel />

      <Tabs key={initialSubTab} value={subTab} onValueChange={(v) => setSubTab(v as OpsSubTab)}>
        <TabsList className="flex w-max gap-0 flex-wrap">
          <TabsTrigger value="summary">{t('operations.tabs.summary')}</TabsTrigger>
          <TabsTrigger value="email">{t('operations.tabs.email')}</TabsTrigger>
          <TabsTrigger value="inventory">{t('operations.tabs.inventory')}</TabsTrigger>
          <TabsTrigger value="fulfillment">{t('operations.tabs.fulfillment')}</TabsTrigger>
          <TabsTrigger value="gps">{t('operations.tabs.gps')}</TabsTrigger>
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
                      <AlertCircle className="h-4 w-4 text-[var(--amber)]" />
                      {t('operations.warnings')}
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
                              {t('operations.review')}
                            </Button>
                          )}
                        </div>
                      )
                    )}
                  </CardContent>
                </Card>
              ) : (
                <AdminEmptyState
                  title={t('operations.noWarningsTitle')}
                  description={t('operations.noWarningsDescription')}
                />
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard
                  icon={<Mail className="h-4 w-4" />}
                  label={t('operations.emailFailed24h')}
                  value={summary?.email?.failed24h ?? 0}
                />
                <MetricCard
                  icon={<Package className="h-4 w-4" />}
                  label={t('operations.openFulfillmentIssues')}
                  value={summary?.fulfillment?.openIssues ?? 0}
                />
                <MetricCard
                  icon={<MapPin className="h-4 w-4" />}
                  label={t('operations.staleGpsDeliveries')}
                  value={summary?.gpsDeliveries?.stale ?? 0}
                />
                <MetricCard
                  icon={<ListOrdered className="h-4 w-4" />}
                  label={t('operations.expiredInventoryLots')}
                  value={summary?.expiry?.expiredLots ?? 0}
                />
              </div>

              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <ConfigCard title={t('operations.emailConfig')}>
                  <p>
                    {t('operations.config.enabled')}:{' '}
                    {summary?.email?.enabled ? t('operations.yes') : t('operations.no')}
                  </p>
                  <p>
                    {t('operations.config.logOnly')}:{' '}
                    {summary?.email?.logOnly ? t('operations.yes') : t('operations.no')}
                  </p>
                  <p>
                    {t('operations.config.provider')}:{' '}
                    {summary?.email?.providerLabel ?? t('common.emDash')}
                  </p>
                  <p>
                    {t('operations.config.configured')}:{' '}
                    {summary?.email?.providerConfigured ? t('operations.yes') : t('operations.no')}
                  </p>
                </ConfigCard>
                <ConfigCard title={t('operations.gpsPrivacy')}>
                  <p>
                    {t('operations.config.platformGps')}:{' '}
                    {summary?.gps?.platformGpsEnabled ? t('operations.on') : t('operations.off')}
                  </p>
                  <p>
                    {t('operations.config.restaurantTracking')}:{' '}
                    {summary?.gps?.restaurantTrackingAllowed
                      ? t('operations.config.allowed')
                      : t('operations.config.disabled')}
                  </p>
                  <p>
                    {t('operations.config.driverNameVisible')}:{' '}
                    {summary?.gps?.showDriverName ? t('operations.yes') : t('operations.no')}
                  </p>
                  <p>
                    {t('operations.config.driverPhoneVisible')}:{' '}
                    {summary?.gps?.showDriverPhone ? t('operations.yes') : t('operations.no')}
                  </p>
                </ConfigCard>
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="email" className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2 items-end">
            <div>
              <Label className="text-xs">{t('common.table.status')}</Label>
              <Select
                value={emailStatus}
                onValueChange={(value) => {
                  setEmailStatus(value)
                  setEmailOffset(0)
                }}
              >
                <SelectTrigger className="mt-1 block w-auto">
                  {EMAIL_STATUS_OPTIONS.map((s) => (
                    <option key={s || 'all'} value={s}>
                      {s ? t(`operations.emailStatus.${s}`) : t('operations.emailStatus.all')}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
          </div>
          {emailLoading ? (
            <AdminLoadingSkeleton rows={6} />
          ) : !emailLogsData?.logs?.length ? (
            <AdminEmptyState
              title={t('operations.noEmailLogsTitle')}
              description={t('operations.noEmailLogsDescription')}
            />
          ) : (
            <div className="rounded-lg border border-[var(--app-border)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-mid)]">
                    <th className="text-left px-3 py-2">{t('common.table.time')}</th>
                    <th className="text-left px-3 py-2">{t('common.table.tenant')}</th>
                    <th className="text-left px-3 py-2">{t('operations.table.event')}</th>
                    <th className="text-left px-3 py-2">{t('common.table.status')}</th>
                    <th className="text-left px-3 py-2">{t('operations.table.recipient')}</th>
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
                {t('common.previous')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={emailOffset + 25 >= (emailLogsData.total || 0)}
                onClick={() => setEmailOffset(emailOffset + 25)}
              >
                {t('common.next')}
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
                <CardTitle className="text-base mb-2">
                  {t('operations.inventory.expiryTitle')}
                </CardTitle>
                <ul className="text-sm space-y-1 text-[var(--text-muted)]">
                  <li>
                    {t('operations.inventory.restaurantsWithLots')}:{' '}
                    {summary?.expiry?.restaurantsWithLots ?? 0}
                  </li>
                  <li>
                    {t('operations.inventory.expiring7d')}: {summary?.expiry?.expiring7d ?? 0}
                  </li>
                  <li>
                    {t('operations.inventory.expiredLots')}: {summary?.expiry?.expiredLots ?? 0}
                  </li>
                  <li>
                    {t('operations.inventory.remindersToday')}:{' '}
                    {summary?.expiry?.remindersToday ?? 0}
                  </li>
                </ul>
              </Card>
              <Card className="p-4">
                <CardTitle className="text-base mb-2">
                  {t('operations.inventory.reorderTitle')}
                </CardTitle>
                <ul className="text-sm space-y-1 text-[var(--text-muted)]">
                  <li>
                    {t('operations.inventory.activePatterns')}:{' '}
                    {summary?.reorder?.activeCadencePatterns ?? 0}
                  </li>
                  <li>
                    {t('operations.inventory.remindersToday')}:{' '}
                    {summary?.reorder?.missedRemindersToday ?? 0}
                  </li>
                  <li>
                    {t('operations.inventory.restaurantsAtRisk')}:{' '}
                    {summary?.reorder?.restaurantsAtRisk ?? 0}
                  </li>
                </ul>
              </Card>
              <Card className="p-4 md:col-span-2">
                <CardTitle className="text-base mb-2">
                  {t('operations.inventory.quickListsTitle')}
                </CardTitle>
                <ul className="text-sm space-y-1 text-[var(--text-muted)]">
                  <li>
                    {t('operations.inventory.totalLists')}: {summary?.quickLists?.totalLists ?? 0}
                  </li>
                  <li>
                    {t('operations.inventory.scheduledLists')}:{' '}
                    {summary?.quickLists?.scheduledLists ?? 0}
                  </li>
                  <li>
                    {t('operations.inventory.restaurantsUsing')}:{' '}
                    {summary?.quickLists?.restaurantsUsing ?? 0}
                  </li>
                  <li>
                    {t('operations.inventory.branchScopedLists')}:{' '}
                    {summary?.quickLists?.branchScopedLists ?? 0}
                  </li>
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
              title={t('operations.noFulfillmentIssuesTitle')}
              description={t('operations.noFulfillmentIssuesDescription')}
            />
          ) : (
            <div className="rounded-lg border border-[var(--app-border)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-mid)]">
                    <th className="text-left px-3 py-2">{t('operations.table.order')}</th>
                    <th className="text-left px-3 py-2">{t('common.supplier')}</th>
                    <th className="text-left px-3 py-2">{t('common.restaurant')}</th>
                    <th className="text-left px-3 py-2">{t('common.table.type')}</th>
                    <th className="text-left px-3 py-2">{t('common.table.status')}</th>
                    <th className="text-left px-3 py-2">{t('operations.table.chat')}</th>
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
                      <td className="px-3 py-2">
                        {row.hasChat ? t('operations.yes') : t('common.emDash')}
                      </td>
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
              <MetricCard
                label={t('operations.gpsActive')}
                value={summary?.gpsDeliveries?.active ?? 0}
              />
              <MetricCard
                label={t('operations.gpsLive')}
                value={summary?.gpsDeliveries?.live ?? 0}
              />
              <MetricCard
                label={t('operations.gpsStale')}
                value={summary?.gpsDeliveries?.stale ?? 0}
              />
              <MetricCard
                label={t('operations.gpsNoGps')}
                value={summary?.gpsDeliveries?.noGps ?? 0}
              />
              <MetricCard
                label={t('operations.gpsFailedToday')}
                value={summary?.gpsDeliveries?.failedToday ?? 0}
              />
            </div>
          )}
          {deliveriesLoading ? (
            <AdminLoadingSkeleton rows={4} />
          ) : !deliveriesData?.deliveries?.length ? (
            <p className="text-sm text-[var(--text-muted)]">
              {t('operations.noDeliveriesInProgress')}
            </p>
          ) : (
            <div className="rounded-lg border border-[var(--app-border)] overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--surface-mid)]">
                    <th className="text-left px-3 py-2">{t('operations.table.order')}</th>
                    <th className="text-left px-3 py-2">{t('common.supplier')}</th>
                    <th className="text-left px-3 py-2">{t('common.table.status')}</th>
                    <th className="text-left px-3 py-2">{t('operations.table.gps')}</th>
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
          <p className="text-xs text-[var(--text-muted)]">{t('operations.gpsAdminNote')}</p>
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
