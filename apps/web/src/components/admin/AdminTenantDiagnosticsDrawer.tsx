import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '../ui/sheet'
import {
  useGetAdminTenantOperationalSnapshotQuery,
  useGetAdminTenantEntitlementsQuery,
  useGetSupplierUsageQuery,
  useGetRestaurantUsageQuery,
} from '../../services/api'
import { AdminLoadingState, AdminStatusBadge } from './adminUi'
import { formatPlanDisplayName } from '../../lib/planComparison'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId: string
  tenantType: 'RESTAURANT' | 'SUPPLIER'
  tenantName: string
  onNavigateLimits?: () => void
  onNavigateFeatures?: () => void
}

export function AdminTenantDiagnosticsDrawer({
  open,
  onOpenChange,
  tenantId,
  tenantType,
  tenantName,
  onNavigateLimits,
  onNavigateFeatures,
}: Props) {
  const { data: snapData, isLoading: snapLoading } = useGetAdminTenantOperationalSnapshotQuery(
    { tenantType, tenantId },
    { skip: !open || !tenantId }
  )
  const { data: entData } = useGetAdminTenantEntitlementsQuery(
    { tenantType, tenantId },
    { skip: !open || !tenantId }
  )
  const { data: supplierUsage } = useGetSupplierUsageQuery(tenantId, {
    skip: !open || tenantType !== 'SUPPLIER',
  })
  const { data: restaurantUsage } = useGetRestaurantUsageQuery(tenantId, {
    skip: !open || tenantType !== 'RESTAURANT',
  })

  const snapshot = snapData?.snapshot
  const entitlements = entData?.entitlements
  const usage = tenantType === 'SUPPLIER' ? supplierUsage?.usage : restaurantUsage?.usage

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{tenantName}</SheetTitle>
          <SheetDescription>Read-only operational diagnostics · {tenantType}</SheetDescription>
        </SheetHeader>

        {snapLoading ? (
          <AdminLoadingState label="Loading diagnostics…" />
        ) : (
          <div className="space-y-4 text-sm">
            <Section title="Subscription">
              <p>
                Plan:{' '}
                {formatPlanDisplayName(
                  snapshot?.subscription?.planCode,
                  snapshot?.subscription?.planName || '—'
                )}
              </p>
              <p>Status: {snapshot?.subscription?.status ?? '—'}</p>
              {snapshot?.subscription?.trialEndsAt && (
                <p>
                  Trial ends: {new Date(snapshot.subscription.trialEndsAt).toLocaleDateString()}
                </p>
              )}
              {snapshot?.writeBlocked && (
                <p className="flex flex-wrap items-center gap-2">
                  <AdminStatusBadge status="blocked" />
                  <span className="text-red-600">Write access blocked</span>
                </p>
              )}
            </Section>

            <Section title="Feature flags (effective)">
              <ul className="text-[var(--text-muted)] space-y-0.5">
                {Object.entries(snapshot?.featureFlags ?? {}).map(([k, v]) => (
                  <li key={k}>
                    {k}: {String(v)}
                  </li>
                ))}
                {!Object.keys(snapshot?.featureFlags ?? {}).length && <li>—</li>}
              </ul>
            </Section>

            {tenantType === 'SUPPLIER' && snapshot?.supplier && (
              <Section title="Supplier operations">
                <p>Drivers: {snapshot.supplier.driverCount}</p>
                <p>
                  GPS today — live {snapshot.supplier.gpsToday?.live ?? 0}, stale{' '}
                  {snapshot.supplier.gpsToday?.stale ?? 0}, no GPS{' '}
                  {snapshot.supplier.gpsToday?.noGps ?? 0}, failed{' '}
                  {snapshot.supplier.gpsToday?.failed ?? 0}
                </p>
                <p>Open fulfillment issues: {snapshot.supplier.openFulfillmentIssues}</p>
                <p>Pending deals: {snapshot.supplier.pendingDeals}</p>
              </Section>
            )}

            {tenantType === 'RESTAURANT' && snapshot?.restaurant && (
              <Section title="Restaurant operations">
                <p>Expiring (7d): {snapshot.restaurant.expiry?.expiring7d ?? 0}</p>
                <p>Expired lots: {snapshot.restaurant.expiry?.expiredLots ?? 0}</p>
                <p>Reorder cadence patterns: {snapshot.restaurant.reorderCadenceAtRisk}</p>
                <p>
                  Quick lists: {snapshot.restaurant.quickLists?.total ?? 0} (
                  {snapshot.restaurant.quickLists?.scheduled ?? 0} scheduled,{' '}
                  {snapshot.restaurant.quickLists?.branchScoped ?? 0} branch-scoped)
                </p>
                <p>
                  Order tracking:{' '}
                  {snapshot.restaurant.restaurantTracking?.platformEnabled
                    ? `enabled (${snapshot.restaurant.restaurantTracking?.activeOrders ?? 0} active orders)`
                    : (snapshot.restaurant.restaurantTracking?.reason ?? 'disabled')}
                </p>
                <p className="text-xs">
                  Privacy: driver name{' '}
                  {snapshot.restaurant.restaurantTracking?.showDriverName ? 'shown' : 'hidden'},
                  phone{' '}
                  {snapshot.restaurant.restaurantTracking?.showDriverPhone ? 'shown' : 'hidden'}
                </p>
              </Section>
            )}

            <Section title="Email">
              <p>
                Provider: {snapshot?.emailConfig?.providerLabel} (
                {snapshot?.emailConfig?.providerConfigured ? 'configured' : 'missing'})
              </p>
              {snapshot?.recentEmailFailures?.length ? (
                <ul className="mt-1 text-[var(--text-muted)]">
                  {snapshot.recentEmailFailures.map(
                    (e: { id: string; eventType: string; recipientRedacted: string }) => (
                      <li key={e.id}>
                        {e.eventType} → {e.recipientRedacted}
                      </li>
                    )
                  )}
                </ul>
              ) : (
                <p className="text-[var(--text-muted)]">No recent failures</p>
              )}
            </Section>

            {usage && (
              <Section title="Usage meters">
                <pre className="text-xs bg-[var(--surface-mid)] p-2 rounded overflow-x-auto max-h-32">
                  {JSON.stringify(usage, null, 2)}
                </pre>
              </Section>
            )}

            {entitlements?.plan && (
              <Section title="Entitlements">
                <p className="text-[var(--text-muted)]">
                  Plan code: {entitlements.plan.code} · overrides:{' '}
                  {(entitlements.overrides ?? []).length}
                </p>
              </Section>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {onNavigateLimits && (
                <button
                  type="button"
                  className="text-sm text-[var(--brand)] underline"
                  onClick={onNavigateLimits}
                >
                  Manage limits
                </button>
              )}
              {onNavigateFeatures && (
                <button
                  type="button"
                  className="text-sm text-[var(--brand)] underline"
                  onClick={onNavigateFeatures}
                >
                  Feature overrides
                </button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-semibold text-[var(--text)] mb-1">{title}</p>
      {children}
    </div>
  )
}
