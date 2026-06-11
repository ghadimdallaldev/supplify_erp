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
  const health = deriveSystemHealth(overview, recentErrorCount)
  const healthTone = health === 'healthy' ? 'success' : health === 'degraded' ? 'warning' : 'danger'

  return (
    <div
      className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6"
      data-testid="admin-executive-summary"
    >
      <AdminKpiCard
        label="Total tenants"
        value={getTotalTenantCount(overview)}
        description="Suppliers + restaurants registered"
        icon={Users}
        tone="neutral"
        testId="kpi-total-tenants"
      />
      <AdminKpiCard
        label="Active suppliers"
        value={overview?.tenantCounts?.SUPPLIER ?? 0}
        description="Active or trialing subscriptions"
        icon={Building2}
        tone="brand"
        testId="kpi-active-suppliers"
      />
      <AdminKpiCard
        label="Active restaurants"
        value={overview?.tenantCounts?.RESTAURANT ?? 0}
        description="Active or trialing subscriptions"
        icon={Store}
        tone="success"
        testId="kpi-active-restaurants"
      />
      <AdminKpiCard
        label="Active subscriptions"
        value={getActiveSubscriptionCount(overview)}
        description="ACTIVE + TRIALING"
        icon={CreditCard}
        tone="brand"
        testId="kpi-active-subscriptions"
      />
      <AdminKpiCard
        label="Orders today"
        value={overview?.orders?.today ?? 0}
        description={`${overview?.orders?.week ?? 0} this week`}
        icon={ListOrdered}
        tone="info"
        testId="kpi-orders-today"
      />
      <AdminKpiCard
        label="System health"
        value={formatSystemHealthLabel(health)}
        description={
          recentErrorCount > 0
            ? `${recentErrorCount} recent error${recentErrorCount > 1 ? 's' : ''}`
            : 'Platform operational status'
        }
        icon={HeartPulse}
        tone={healthTone}
        testId="kpi-system-health"
      />
    </div>
  )
}
