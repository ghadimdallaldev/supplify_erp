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
import { AdminKpiCard } from './AdminKpiCard'
import { AdminSectionHeader } from './adminUi'

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
  const navigateOps = (subTab: 'email' | 'fulfillment' | 'gps' | 'inventory') => {
    onOperationsSubTab?.(subTab)
    onNavigateTab?.('operations')
  }

  return (
    <section className="space-y-4" data-testid="admin-operations-snapshot">
      <AdminSectionHeader
        title="Operations Snapshot"
        description="Daily platform activity and operational health"
      />

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Orders & Activity
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <AdminKpiCard
            label="Orders today"
            value={overview?.orders?.today ?? 0}
            icon={ListOrdered}
            tone="brand"
          />
          <AdminKpiCard
            label="Orders this week"
            value={overview?.orders?.week ?? 0}
            icon={ListOrdered}
            tone="neutral"
          />
          <AdminKpiCard
            label="Orders this month"
            value={overview?.orders?.month ?? 0}
            icon={ListOrdered}
            tone="neutral"
          />
          <AdminKpiCard
            label="Active carts"
            value={overview?.activeCarts ?? 0}
            description="Draft orders with items"
            icon={ShoppingCart}
            tone="brand"
          />
          <AdminKpiCard
            label="Chats 24h"
            value={overview?.chatsLast24h ?? 0}
            icon={MessageSquare}
            tone="success"
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Reservations & Catalog
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <AdminKpiCard
            label="Reservations today"
            value={overview?.reservations?.today ?? 0}
            icon={Calendar}
            tone="success"
          />
          <AdminKpiCard
            label="Active products"
            value={overview?.totalActiveProducts ?? 0}
            icon={Package}
            tone="brand"
          />
          <AdminKpiCard
            label="Quick lists"
            value={overview?.totalQuickLists ?? 0}
            icon={ListOrdered}
            tone="neutral"
          />
          <AdminKpiCard
            label="Pending deals"
            value={overview?.alerts?.pendingDealApprovals ?? 0}
            description="Awaiting approval"
            icon={Tag}
            tone="warning"
          />
        </div>
      </div>

      {overview?.aiReorder && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            AI Reorder
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <AdminKpiCard
              label="AI requests 24h"
              value={overview.aiReorder.requests24h ?? 0}
              icon={Sparkles}
              tone="brand"
            />
            <AdminKpiCard
              label="Success rate"
              value={
                overview.aiReorder.successRate != null
                  ? `${Math.round(overview.aiReorder.successRate)}%`
                  : 'N/A'
              }
              icon={Sparkles}
              tone={
                overview.aiReorder.successRate != null && overview.aiReorder.successRate < 90
                  ? 'warning'
                  : 'success'
              }
            />
            <AdminKpiCard
              label="AI_ENABLED"
              value={overview.aiReorder.aiEnabled ? 'On' : 'Off'}
              description="Platform LLM kill switch"
              icon={Sparkles}
              tone={overview.aiReorder.aiEnabled ? 'success' : 'neutral'}
            />
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Operational Health
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <button type="button" className="text-left" onClick={() => navigateOps('email')}>
            <AdminKpiCard
              label="Failed emails 24h"
              value={overview?.operational?.emailFailed24h ?? 0}
              icon={Mail}
              tone={(overview?.operational?.emailFailed24h ?? 0) >= 5 ? 'warning' : 'neutral'}
              className="cursor-pointer hover:border-[var(--brand-mid)] transition-colors"
            />
          </button>
          <button type="button" className="text-left" onClick={() => navigateOps('fulfillment')}>
            <AdminKpiCard
              label="Fulfillment issues"
              value={overview?.operational?.openFulfillmentIssues ?? 0}
              icon={Package}
              tone={
                (overview?.operational?.openFulfillmentIssues ?? 0) >= 10 ? 'warning' : 'neutral'
              }
              className="cursor-pointer hover:border-[var(--brand-mid)] transition-colors"
            />
          </button>
          <button type="button" className="text-left" onClick={() => navigateOps('gps')}>
            <AdminKpiCard
              label="Stale GPS"
              value={overview?.operational?.staleGpsDeliveries ?? 0}
              icon={MapPin}
              tone={(overview?.operational?.staleGpsDeliveries ?? 0) >= 10 ? 'warning' : 'neutral'}
              className="cursor-pointer hover:border-[var(--brand-mid)] transition-colors"
            />
          </button>
          <button type="button" className="text-left" onClick={() => onNavigateTab?.('health')}>
            <AdminKpiCard
              label="System errors"
              value={recentErrorCount}
              icon={AlertCircle}
              tone={recentErrorCount > 0 ? 'danger' : 'success'}
              className="cursor-pointer hover:border-[var(--brand-mid)] transition-colors"
            />
          </button>
          <AdminKpiCard
            label="Tenants over limit"
            value={
              typeof overview?.tenantsOverLimit === 'number'
                ? overview.tenantsOverLimit
                : 'Not available'
            }
            description={
              typeof overview?.tenantsNearLimit === 'number'
                ? `${overview.tenantsNearLimit} near limit`
                : 'From usage_meter aggregates'
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
      </div>
    </section>
  )
}
