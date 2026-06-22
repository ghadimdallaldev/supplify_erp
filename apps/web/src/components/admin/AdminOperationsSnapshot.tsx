import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '../../lib/utils'
import {
  AlertCircle,
  Calendar,
  ListOrdered,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  ShoppingCart,
  Sparkles,
  Tag,
} from 'lucide-react'
import type { AdminOverview } from '../../lib/adminOverview'
import { AppPanel } from '../ui/app-panel'
import { AdminKpiCard } from './AdminKpiCard'

function SnapshotGroup({
  title,
  children,
  divided,
}: {
  title: string
  children: ReactNode
  divided?: boolean
}) {
  return (
    <section className={cn(divided && 'border-t border-[var(--app-border)] pt-6')}>
      <h3 className="mb-3 text-sm font-semibold text-[var(--text)]">{title}</h3>
      {children}
    </section>
  )
}

export function AdminOperationsSnapshot({
  overview,
  recentErrorCount = 0,
  onNavigateTab,
  onOperationsSubTab,
}: {
  overview?: AdminOverview | null
  recentErrorCount?: number
  onNavigateTab?: (tab: string) => void
  onOperationsSubTab?: (subTab: 'email' | 'fulfillment' | 'gps' | 'inventory') => void
}) {
  const { t } = useTranslation('admin')
  const navigateOps = (subTab: 'email' | 'fulfillment' | 'gps' | 'inventory') => {
    onOperationsSubTab?.(subTab)
    onNavigateTab?.('operations')
  }

  return (
    <AppPanel
      title={t('operationsSnapshot.title')}
      description={t('operationsSnapshot.description')}
      testId="admin-operations-snapshot"
      className="mb-4"
    >
      <div>
        <SnapshotGroup title={t('operationsSnapshot.ordersActivity')}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <AdminKpiCard
              label={t('operationsSnapshot.ordersToday')}
              value={overview?.orders?.today ?? 0}
              icon={ListOrdered}
              tone="brand"
            />
            <AdminKpiCard
              label={t('operationsSnapshot.ordersWeek')}
              value={overview?.orders?.week ?? 0}
              icon={ListOrdered}
              tone="neutral"
            />
            <AdminKpiCard
              label={t('operationsSnapshot.ordersMonth')}
              value={overview?.orders?.month ?? 0}
              icon={ListOrdered}
              tone="neutral"
            />
            <AdminKpiCard
              label={t('operationsSnapshot.activeCarts')}
              value={overview?.activeCarts ?? 0}
              description={t('operationsSnapshot.activeCartsDescription')}
              icon={ShoppingCart}
              tone="brand"
            />
            <AdminKpiCard
              label={t('operationsSnapshot.chats24h')}
              value={overview?.chatsLast24h ?? 0}
              icon={MessageSquare}
              tone="success"
            />
          </div>
        </SnapshotGroup>

        <SnapshotGroup title={t('operationsSnapshot.reservationsCatalog')} divided>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <AdminKpiCard
              label={t('operationsSnapshot.reservationsToday')}
              value={overview?.reservations?.today ?? 0}
              icon={Calendar}
              tone="success"
            />
            <AdminKpiCard
              label={t('operationsSnapshot.activeProducts')}
              value={overview?.totalActiveProducts ?? 0}
              icon={Package}
              tone="brand"
            />
            <AdminKpiCard
              label={t('operationsSnapshot.quickLists')}
              value={overview?.totalQuickLists ?? 0}
              icon={ListOrdered}
              tone="neutral"
            />
            <AdminKpiCard
              label={t('operationsSnapshot.pendingDeals')}
              value={overview?.alerts?.pendingDealApprovals ?? 0}
              description={t('operationsSnapshot.pendingDealsDescription')}
              icon={Tag}
              tone="warning"
            />
          </div>
        </SnapshotGroup>

        {overview?.aiReorder ? (
          <SnapshotGroup title={t('operationsSnapshot.aiReorder')} divided>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <AdminKpiCard
                label={t('operationsSnapshot.aiRequests24h')}
                value={overview.aiReorder.requests24h ?? 0}
                icon={Sparkles}
                tone="brand"
              />
              <AdminKpiCard
                label={t('operationsSnapshot.successRate')}
                value={
                  overview.aiReorder.successRate != null
                    ? `${Math.round(overview.aiReorder.successRate)}%`
                    : t('operationsSnapshot.notAvailableShort')
                }
                icon={Sparkles}
                tone={
                  overview.aiReorder.successRate != null && overview.aiReorder.successRate < 90
                    ? 'warning'
                    : 'success'
                }
              />
              <AdminKpiCard
                label={t('operationsSnapshot.aiEnabled')}
                value={
                  overview.aiReorder.aiEnabled
                    ? t('operationsSnapshot.on')
                    : t('operationsSnapshot.off')
                }
                description={t('operationsSnapshot.aiEnabledDescription')}
                icon={Sparkles}
                tone={overview.aiReorder.aiEnabled ? 'success' : 'neutral'}
              />
            </div>
          </SnapshotGroup>
        ) : null}

        <SnapshotGroup title={t('operationsSnapshot.operationalHealth')} divided>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <button type="button" className="text-left" onClick={() => navigateOps('email')}>
              <AdminKpiCard
                label={t('operationsSnapshot.failedEmails24h')}
                value={overview?.operational?.emailFailed24h ?? 0}
                icon={Mail}
                tone={(overview?.operational?.emailFailed24h ?? 0) >= 5 ? 'warning' : 'neutral'}
                className="cursor-pointer transition-colors hover:border-[var(--brand-mid)]"
              />
            </button>
            <button type="button" className="text-left" onClick={() => navigateOps('fulfillment')}>
              <AdminKpiCard
                label={t('operationsSnapshot.fulfillmentIssues')}
                value={overview?.operational?.openFulfillmentIssues ?? 0}
                icon={Package}
                tone={
                  (overview?.operational?.openFulfillmentIssues ?? 0) >= 10 ? 'warning' : 'neutral'
                }
                className="cursor-pointer transition-colors hover:border-[var(--brand-mid)]"
              />
            </button>
            <button type="button" className="text-left" onClick={() => navigateOps('gps')}>
              <AdminKpiCard
                label={t('operationsSnapshot.staleGps')}
                value={overview?.operational?.staleGpsDeliveries ?? 0}
                icon={MapPin}
                tone={
                  (overview?.operational?.staleGpsDeliveries ?? 0) >= 10 ? 'warning' : 'neutral'
                }
                className="cursor-pointer transition-colors hover:border-[var(--brand-mid)]"
              />
            </button>
            <button type="button" className="text-left" onClick={() => onNavigateTab?.('health')}>
              <AdminKpiCard
                label={t('operationsSnapshot.systemErrors')}
                value={recentErrorCount}
                icon={AlertCircle}
                tone={recentErrorCount > 0 ? 'danger' : 'success'}
                className="cursor-pointer transition-colors hover:border-[var(--brand-mid)]"
              />
            </button>
            <AdminKpiCard
              label={t('operationsSnapshot.tenantsOverLimit')}
              value={
                typeof overview?.tenantsOverLimit === 'number'
                  ? overview.tenantsOverLimit
                  : t('common.notAvailable')
              }
              description={
                typeof overview?.tenantsNearLimit === 'number'
                  ? t('operationsSnapshot.tenantsNearLimit', { count: overview.tenantsNearLimit })
                  : t('operationsSnapshot.fromUsageAggregates')
              }
              icon={AlertCircle}
              tone={
                (overview?.tenantsOverLimit ?? 0) > 0
                  ? 'danger'
                  : (overview?.tenantsNearLimit ?? 0) > 0
                    ? 'warning'
                    : 'success'
              }
            />
          </div>
        </SnapshotGroup>
      </div>
    </AppPanel>
  )
}
