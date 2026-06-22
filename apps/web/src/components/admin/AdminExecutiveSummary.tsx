import { useTranslation } from 'react-i18next'
import { Building2, CreditCard, HeartPulse, ListOrdered, Store, Users } from 'lucide-react'
import type { AdminOverview } from '../../lib/adminOverview'
import {
  deriveSystemHealth,
  formatSystemHealthLabel,
  getActiveSubscriptionCount,
  getTotalTenantCount,
} from '../../lib/adminOverview'
import { AdminKpiCard } from './AdminKpiCard'

export function AdminExecutiveSummary({
  overview,
  recentErrorCount = 0,
}: {
  overview?: AdminOverview | null
  recentErrorCount?: number
}) {
  const { t } = useTranslation('admin')
  const health = deriveSystemHealth(overview, recentErrorCount)
  const healthTone = health === 'healthy' ? 'success' : health === 'degraded' ? 'warning' : 'danger'

  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
      data-testid="admin-executive-summary"
    >
      <AdminKpiCard
        label={t('executiveSummary.totalTenants')}
        value={getTotalTenantCount(overview)}
        description={t('executiveSummary.totalTenantsDescription')}
        icon={Users}
        tone="neutral"
        testId="kpi-total-tenants"
      />
      <AdminKpiCard
        label={t('executiveSummary.activeSuppliers')}
        value={overview?.tenantCounts?.SUPPLIER ?? 0}
        description={t('executiveSummary.subscriptionDescription')}
        icon={Building2}
        tone="brand"
        testId="kpi-active-suppliers"
      />
      <AdminKpiCard
        label={t('executiveSummary.activeRestaurants')}
        value={overview?.tenantCounts?.RESTAURANT ?? 0}
        description={t('executiveSummary.subscriptionDescription')}
        icon={Store}
        tone="success"
        testId="kpi-active-restaurants"
      />
      <AdminKpiCard
        label={t('executiveSummary.activeSubscriptions')}
        value={getActiveSubscriptionCount(overview)}
        description={t('executiveSummary.activeSubscriptionsDescription')}
        icon={CreditCard}
        tone="brand"
        testId="kpi-active-subscriptions"
      />
      <AdminKpiCard
        label={t('executiveSummary.ordersToday')}
        value={overview?.orders?.today ?? 0}
        description={t('executiveSummary.ordersThisWeek', { count: overview?.orders?.week ?? 0 })}
        icon={ListOrdered}
        tone="info"
        testId="kpi-orders-today"
      />
      <AdminKpiCard
        label={t('executiveSummary.systemHealth')}
        value={formatSystemHealthLabel(health)}
        description={
          recentErrorCount > 0
            ? t('executiveSummary.recentErrors', { count: recentErrorCount })
            : t('executiveSummary.platformOperational')
        }
        icon={HeartPulse}
        tone={healthTone}
        testId="kpi-system-health"
      />
    </div>
  )
}
