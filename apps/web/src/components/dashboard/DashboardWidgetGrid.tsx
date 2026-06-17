import { Link } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { Package, ShoppingCart, AlertTriangle, Loader2, Warehouse, Users } from 'lucide-react'
import { useGetSupplierGrowthMetricsQuery } from '../../services/api/endpoints/growth'
import { useGetEntitlementsQuery } from '../../services/api'
import { useAppSelector } from '../../hooks/redux'
import { usePermissions } from '../../hooks/usePermissions'
import { canUseSupplierGrowth } from '../../lib/planFeatureGates'
import { canViewSupplierGrowth } from '../../lib/tenantRoles'
import { toast } from 'sonner'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { StatusBadge } from '../ui/status-badge'
import { formatCurrency } from '../../utils/format'
import {
  SectionCard,
  SPEND_TREND_DAYS,
  DASHBOARD_GRID_GAP,
  DASHBOARD_STACK_GAP,
} from './dashboardShared'

const SpendTrendChart = lazy(() =>
  import('./SpendTrendChart').then((m) => ({ default: m.SpendTrendChart }))
)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function DashboardWidgetGrid(props: any) {
  const {
    isRestaurant,
    isSupplier,
    showRestaurantSection,
    orders,
    stats,
    spendTrend,
    spendTrendSource,
    spendTrendPeriodTotal,
    lowStockItems,
    smartReorderEnabled,
    inventoryMgmtEnabled,
    reorderSuggestions,
    reorderRemindersData,
    expirySummaryData,
    atRiskData,
    quickListsData,
    addingSuggestionId,
    setAddingSuggestionId,
    addItemToQuickList,
    restaurantLayout,
  } = props

  const { can } = usePermissions()
  const { user } = useAppSelector((state) => state.auth)
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !isSupplier })
  const supplierGrowthEnabled =
    isSupplier &&
    canUseSupplierGrowth(entitlementsData?.entitlements) &&
    canViewSupplierGrowth(user, can)

  const { data: growthMetrics } = useGetSupplierGrowthMetricsQuery(undefined, {
    skip: !supplierGrowthEnabled,
  })

  return (
    <>
      <div className="dashboard-content-grid">
        {/* Col 1 — Recent Orders */}
        {showRestaurantSection('showRecentOrders') && (
          <SectionCard
            title="Recent Orders"
            action={
              <Link
                to="/app/orders"
                style={{
                  fontSize: 11,
                  color: 'var(--brand)',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                View all →
              </Link>
            }
          >
            {/* Order list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {orders.length === 0 ? (
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    textAlign: 'center',
                    padding: '16px 0',
                  }}
                >
                  No recent orders
                </p>
              ) : (
                orders.slice(0, 3).map((o: any) => (
                  <Link
                    key={o.id}
                    to={`/app/orders/${o.id}`}
                    className="dashboard-split-row"
                    style={{
                      padding: '8px 4px',
                      borderBottom: '1px solid var(--app-border)',
                      textDecoration: 'none',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: 'var(--text)',
                          fontFamily: "'JetBrains Mono', monospace",
                          whiteSpace: 'nowrap',
                        }}
                      >
                        #{o.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          marginTop: 1,
                        }}
                      >
                        {isSupplier
                          ? o.restaurant_name || o.restaurantName || 'Customer'
                          : `From: ${o.supplier_name || o.supplierName || 'Supplier'}`}
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: 3,
                        flexShrink: 0,
                      }}
                    >
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                        {formatCurrency(o.total_amount)}
                      </span>
                      <StatusBadge status={o.status} />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </SectionCard>
        )}

        {/* Col 2 — Supplier: order status bars | Restaurant: spend trend */}
        {isSupplier ? (
          <SectionCard title="Order Status">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
              {[
                {
                  label: 'Completed',
                  value: stats?.completedOrders ?? 0,
                  color: 'var(--mint-mid)',
                },
                { label: 'Pending', value: stats?.pendingOrders ?? 0, color: 'var(--amber-mid)' },
                {
                  label: 'Processing',
                  value: Math.max(
                    0,
                    (stats?.totalOrders ?? 0) -
                      (stats?.completedOrders ?? 0) -
                      (stats?.pendingOrders ?? 0)
                  ),
                  color: 'var(--brand-mid)',
                },
              ].map(({ label, value, color }) => {
                const total = stats?.totalOrders || 1
                const pct = Math.round((value / total) * 100)
                return (
                  <div key={label}>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div
                          style={{ width: 8, height: 8, borderRadius: '50%', background: color }}
                        />
                        <span style={{ fontSize: 12, color: 'var(--text-mid)', fontWeight: 500 }}>
                          {label}
                        </span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                        {value}
                      </span>
                    </div>
                    <div
                      style={{
                        height: 5,
                        background: 'var(--brand-ultra)',
                        borderRadius: 4,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          height: '100%',
                          width: '100%',
                          background: color,
                          borderRadius: 4,
                          transformOrigin: 'left',
                          transform: `scaleX(${pct / 100})`,
                          transition: 'transform 200ms ease-out',
                        }}
                      />
                    </div>
                  </div>
                )
              })}

              <div
                style={{
                  marginTop: 8,
                  paddingTop: 10,
                  borderTop: '1px solid var(--app-border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  Total orders (all time)
                </span>
                <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text)' }}>
                  {stats?.totalOrders ?? 0}
                </span>
              </div>
            </div>
          </SectionCard>
        ) : showRestaurantSection('showSpendTrend') ? (
          <SectionCard
            title="Spend Trend"
            action={<span style={{ fontSize: 10, color: 'var(--text-muted)' }}>30 days</span>}
          >
            {spendTrend.length > 0 ? (
              <Suspense
                fallback={
                  <Skeleton
                    className="h-[120px] w-full rounded-md"
                    aria-label="Loading spend trend"
                  />
                }
              >
                <SpendTrendChart data={spendTrend} />
              </Suspense>
            ) : (
              <p
                style={{
                  fontSize: 12,
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  padding: '32px 0',
                }}
              >
                {typeof stats?.totalSpent === 'number' && stats.totalSpent > 0
                  ? `No spend in the last ${SPEND_TREND_DAYS} days. Your all-time order total is in the KPI above.`
                  : 'No spend data yet'}
              </p>
            )}
            <div
              style={{
                marginTop: 8,
                paddingTop: 10,
                borderTop: '1px solid var(--app-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {spendTrend.length > 0
                  ? `Last ${SPEND_TREND_DAYS} days${spendTrendSource === 'orders' ? ' (orders)' : ''}`
                  : 'All-time (orders)'}
              </span>
              <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text)' }}>
                {formatCurrency(
                  spendTrend.length > 0
                    ? spendTrendPeriodTotal
                    : typeof stats?.totalSpent === 'number'
                      ? stats.totalSpent
                      : 0
                )}
              </span>
            </div>
          </SectionCard>
        ) : null}

        {/* Col 3 — Restaurant: reorder | Supplier: low stock */}
        {(isSupplier || showRestaurantSection('showReorderAlerts')) && (
          <SectionCard
            title={isSupplier ? 'Low Stock' : 'Reorder Alerts'}
            action={
              isSupplier && lowStockItems.length > 0 ? (
                <Link
                  to="/app/inventory"
                  style={{
                    fontSize: 11,
                    color: 'var(--brand)',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  View all →
                </Link>
              ) : isRestaurant && smartReorderEnabled ? (
                <Link
                  to="/app/inventory#reorder-assistance"
                  style={{
                    fontSize: 11,
                    color: 'var(--brand)',
                    textDecoration: 'none',
                    fontWeight: 600,
                  }}
                >
                  View all →
                </Link>
              ) : undefined
            }
          >
            {isSupplier ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {lowStockItems.length === 0 ? (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      textAlign: 'center',
                      padding: '16px 0',
                    }}
                  >
                    All products are above their stock thresholds
                  </p>
                ) : (
                  lowStockItems.map((item: any) => (
                    <Link
                      key={item.product_id}
                      to="/app/inventory"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 0',
                        borderBottom: '1px solid var(--app-border)',
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <Warehouse size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: 'var(--text)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.product_name || item.name || 'Product'}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                          Available: {item.available_qty ?? 0}
                          {item.low_stock_threshold != null
                            ? ` · Threshold: ${item.low_stock_threshold}`
                            : ''}
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            ) : isRestaurant ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {(reorderSuggestions?.suggestions?.length ?? 0) === 0 ? (
                  <p
                    style={{
                      fontSize: 12,
                      color: 'var(--text-muted)',
                      textAlign: 'center',
                      padding: '16px 0',
                    }}
                  >
                    No reorder suggestions
                  </p>
                ) : (
                  reorderSuggestions!.suggestions.slice(0, 3).map((s: any, idx: number) => {
                    const qty =
                      s.suggested_reorder_qty ?? Math.max(1, Math.ceil(s.avg_daily_usage_30day * 3))
                    const urgencyColor =
                      idx === 0 ? 'var(--red)' : idx === 1 ? 'var(--amber)' : 'var(--mint-mid)'
                    const isAdding = addingSuggestionId === s.id

                    const handleAdd = async () => {
                      const lists = quickListsData?.quickLists || []
                      if (lists.length === 0) {
                        toast.error('Create a quick list first')
                        return
                      }
                      setAddingSuggestionId(s.id)
                      try {
                        await addItemToQuickList({
                          quickListId: lists[0].id,
                          body: {
                            productId: s.product_id,
                            supplierId: s.supplier_id,
                            quantity: qty,
                          },
                        }).unwrap()
                        toast.success(`Added ${s.product_name} (${qty}) to ${lists[0].name}`)
                      } catch (e: any) {
                        toast.error(e?.data?.error?.message || 'Failed to add to quick list')
                      } finally {
                        setAddingSuggestionId(null)
                      }
                    }

                    return (
                      <div
                        key={s.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 0',
                          borderBottom: '1px solid var(--app-border)',
                        }}
                      >
                        <div
                          style={{
                            width: 4,
                            height: 36,
                            borderRadius: '0 2px 2px 0',
                            background: urgencyColor,
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: 'var(--text)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {s.product_name}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                            Current: {s.current_qty} · Suggest: {qty}
                          </div>
                        </div>
                        <button
                          disabled={
                            isAdding ||
                            Boolean(
                              isRestaurant &&
                                restaurantLayout &&
                                !restaurantLayout.allowReorderActions
                            )
                          }
                          onClick={handleAdd}
                          style={{
                            background: 'var(--brand-pale)',
                            color: 'var(--brand)',
                            border: 'none',
                            borderRadius: 6,
                            padding: '4px 8px',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: isAdding ? 'not-allowed' : 'pointer',
                            fontFamily: 'inherit',
                            flexShrink: 0,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                          }}
                        >
                          {isAdding ? <Loader2 size={11} className="animate-spin" /> : '+ Add'}
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            ) : null}
          </SectionCard>
        )}
      </div>

      {(isRestaurant &&
        showRestaurantSection('showExpiry') &&
        inventoryMgmtEnabled &&
        expirySummaryData?.summary) ||
      (isRestaurant &&
        showRestaurantSection('showReorderReminders') &&
        smartReorderEnabled &&
        (reorderRemindersData?.reminders?.length ?? 0) > 0) ||
      (isSupplier && (atRiskData?.atRisk?.length ?? 0) > 0) ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: DASHBOARD_GRID_GAP,
            marginTop: DASHBOARD_STACK_GAP,
          }}
        >
          {isRestaurant && inventoryMgmtEnabled && expirySummaryData?.summary ? (
            <SectionCard
              title="Inventory expiry"
              action={
                <Link
                  to="/app/inventory?tab=expiry"
                  style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}
                >
                  View all →
                </Link>
              }
            >
              <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Expiring soon</div>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>
                    {expirySummaryData.summary.expiringSoonCount ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>Expired</div>
                  <div style={{ fontWeight: 800, fontSize: 20, color: 'var(--danger, #b91c1c)' }}>
                    {expirySummaryData.summary.expiredCount ?? 0}
                  </div>
                </div>
              </div>
              {(expirySummaryData.summary.topNearestExpiry?.length ?? 0) > 0 && (
                <ul style={{ marginTop: 12, padding: 0, listStyle: 'none', fontSize: 12 }}>
                  {expirySummaryData.summary.topNearestExpiry
                    .slice(0, 5)
                    .map((lot: { id: string; itemName: string; expiryDate: string }) => (
                      <li
                        key={lot.id}
                        style={{ padding: '4px 0', borderTop: '1px solid var(--app-border)' }}
                      >
                        {lot.itemName} — {new Date(lot.expiryDate).toLocaleDateString()}
                      </li>
                    ))}
                </ul>
              )}
            </SectionCard>
          ) : null}

          {isRestaurant &&
          smartReorderEnabled &&
          (reorderRemindersData?.reminders?.length ?? 0) > 0 ? (
            <SectionCard
              title="Suggested reorder reminders"
              action={
                <Link
                  to="/app/quick-lists"
                  style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}
                >
                  Ordering lists →
                </Link>
              }
            >
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12 }}>
                {reorderRemindersData.reminders
                  .slice(0, 5)
                  .map(
                    (r: { id: string; label: string; supplierName: string; dayName: string }) => (
                      <li
                        key={r.id}
                        style={{ padding: '6px 0', borderBottom: '1px solid var(--app-border)' }}
                      >
                        You usually order {r.label} on {r.dayName}s.
                      </li>
                    )
                  )}
              </ul>
            </SectionCard>
          ) : null}

          {isSupplier && (atRiskData?.atRisk?.length ?? 0) > 0 ? (
            <SectionCard
              title="At-risk expected orders"
              action={
                <Link
                  to="/app/command-center"
                  style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}
                >
                  Command center →
                </Link>
              }
            >
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', fontSize: 12 }}>
                {atRiskData.atRisk
                  .slice(0, 5)
                  .map(
                    (r: {
                      cadenceId: string
                      restaurantName: string
                      label: string
                      dayName: string
                    }) => (
                      <li
                        key={r.cadenceId}
                        style={{ padding: '6px 0', borderBottom: '1px solid var(--app-border)' }}
                      >
                        {r.restaurantName} — usually orders {r.label} on {r.dayName}s.
                      </li>
                    )
                  )}
              </ul>
            </SectionCard>
          ) : null}

          {isSupplier && growthMetrics ? (
            <SectionCard
              title="Customer Growth"
              action={
                <Link
                  to="/app/customer-growth"
                  style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}
                >
                  Manage →
                </Link>
              }
            >
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-[var(--text-muted)]">Imported</span>
                  <div className="font-semibold">{growthMetrics.importedCustomers}</div>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Converted</span>
                  <div className="font-semibold">{growthMetrics.convertedCustomers}</div>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Invited</span>
                  <div className="font-semibold">{growthMetrics.invitedCustomers}</div>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">Rewards</span>
                  <div className="font-semibold flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {growthMetrics.rewardsEarned.freeMonths} mo
                  </div>
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
