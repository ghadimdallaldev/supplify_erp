import { Link } from 'react-router-dom'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, Warehouse, Users } from 'lucide-react'
import { useGetSupplierGrowthMetricsQuery } from '../../services/api/endpoints/growth'
import {
  useGetEntitlementsQuery,
  useAiRecommendReorderAssistanceMutation,
} from '../../services/api'
import { useAppSelector } from '../../hooks/redux'
import { usePermissions } from '../../hooks/usePermissions'
import { canUseSupplierGrowth } from '../../lib/planFeatureGates'
import { canViewSupplierGrowth } from '../../lib/tenantRoles'
import { toast } from 'sonner'
import { Skeleton } from '../ui/skeleton'
import { StatusBadge } from '../ui/status-badge'
import { formatCurrency } from '../../utils/format'
import type { ReorderAiRecommendation } from '../../types/reorder'
import {
  DashboardWidgetPanel,
  SPEND_TREND_PERIOD_OPTIONS,
  type SpendTrendPeriodDays,
  DASHBOARD_GRID_GAP,
  DASHBOARD_STACK_GAP,
} from './dashboardShared'

const SpendTrendChart = lazy(() =>
  import('./SpendTrendChart').then((m) => ({ default: m.SpendTrendChart }))
)

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
    periodDays = 30,
    onPeriodDaysChange,
    financeInvoicesEnabled = false,
    lowStockItems,
    smartReorderEnabled,
    smartReorderAiRecommendEligible = false,
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

  const { t } = useTranslation('dashboard')
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

  const [aiRecommend] = useAiRecommendReorderAssistanceMutation()
  const [aiRecByProduct, setAiRecByProduct] = useState<Record<string, ReorderAiRecommendation>>({})
  const dashboardRecKey = useRef<string | null>(null)

  const topReorderProductIds = useMemo(() => {
    const list = reorderSuggestions?.suggestions ?? []
    return list
      .slice(0, 3)
      .map((s: any) => s.product_id || s.productId)
      .filter(Boolean)
      .map(String)
  }, [reorderSuggestions])

  useEffect(() => {
    if (!isRestaurant || !smartReorderAiRecommendEligible || topReorderProductIds.length === 0) {
      setAiRecByProduct({})
      dashboardRecKey.current = null
      return
    }
    const key = topReorderProductIds.join(',')
    if (dashboardRecKey.current === key) return
    dashboardRecKey.current = key

    let cancelled = false
    ;(async () => {
      try {
        const result = await aiRecommend({
          productIds: topReorderProductIds,
          limit: topReorderProductIds.length,
        }).unwrap()
        if (cancelled) return
        const map: Record<string, ReorderAiRecommendation> = {}
        for (const rec of result.recommendations || []) {
          if (rec.productId) map[String(rec.productId)] = rec
        }
        setAiRecByProduct(map)
      } catch {
        if (!cancelled) setAiRecByProduct({})
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isRestaurant, smartReorderAiRecommendEligible, topReorderProductIds, aiRecommend])

  return (
    <>
      <div className="dashboard-content-grid">
        {/* Col 1 — Recent Orders */}
        {showRestaurantSection('showRecentOrders') && (
          <DashboardWidgetPanel
            title={t('widgets.recentOrders.title')}
            action={
              <Link
                to="/app/orders"
                className="text-[11px] font-semibold text-[var(--brand)] no-underline hover:underline"
              >
                {t('widgets.recentOrders.viewAll')}
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
                  {t('widgets.recentOrders.empty')}
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
                          ? o.restaurant_name ||
                            o.restaurantName ||
                            t('widgets.recentOrders.customerFallback')
                          : t('widgets.recentOrders.fromSupplier', {
                              name:
                                o.supplier_name ||
                                o.supplierName ||
                                t('widgets.recentOrders.supplierFallback'),
                            })}
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
          </DashboardWidgetPanel>
        )}

        {/* Col 2 — Supplier: order status bars | Restaurant: spend trend */}
        {isSupplier ? (
          <DashboardWidgetPanel title={t('widgets.orderStatus.title')}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
              {[
                {
                  label: t('widgets.orderStatus.completed'),
                  value: stats?.completedOrders ?? 0,
                  color: 'var(--mint-mid)',
                },
                {
                  label: t('widgets.orderStatus.pending'),
                  value: stats?.pendingOrders ?? 0,
                  color: 'var(--amber-mid)',
                },
                {
                  label: t('widgets.orderStatus.processing'),
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
                  {t('widgets.orderStatus.totalAllTime')}
                </span>
                <span style={{ fontSize: 14, fontWeight: 900, color: 'var(--text)' }}>
                  {stats?.totalOrders ?? 0}
                </span>
              </div>
            </div>
          </DashboardWidgetPanel>
        ) : showRestaurantSection('showSpendTrend') ? (
          <DashboardWidgetPanel
            title={t('widgets.spendTrend.title')}
            action={
              financeInvoicesEnabled && onPeriodDaysChange ? (
                <div
                  className="flex items-center gap-0.5"
                  role="group"
                  aria-label={t('widgets.spendTrend.periodAriaLabel')}
                  data-testid="spend-trend-period-toggle"
                >
                  {SPEND_TREND_PERIOD_OPTIONS.map((days) => (
                    <button
                      key={days}
                      type="button"
                      data-testid={`spend-trend-period-${days}d`}
                      aria-pressed={periodDays === days}
                      onClick={() => onPeriodDaysChange(days as SpendTrendPeriodDays)}
                      className="cursor-pointer rounded-[5px] border px-1.5 py-0.5 text-[10px] font-bold font-[inherit]"
                      style={{
                        borderColor: periodDays === days ? 'var(--brand-mid)' : 'var(--app-border)',
                        background: periodDays === days ? 'var(--brand-pale)' : 'var(--surface)',
                        color: periodDays === days ? 'var(--brand)' : 'var(--text-muted)',
                      }}
                    >
                      {t('widgets.spendTrend.periodDays', { days })}
                    </button>
                  ))}
                </div>
              ) : undefined
            }
          >
            {spendTrend.length > 0 ? (
              <Suspense
                fallback={
                  <Skeleton
                    className="h-[120px] w-full rounded-md"
                    aria-label={t('widgets.spendTrend.loadingAriaLabel')}
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
                  ? t('widgets.spendTrend.emptyNoRecent', { days: periodDays })
                  : t('widgets.spendTrend.emptyNoData')}
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
                  ? spendTrendSource === 'orders'
                    ? t('widgets.spendTrend.footerLastDaysOrders', { days: periodDays })
                    : t('widgets.spendTrend.footerLastDays', { days: periodDays })
                  : t('widgets.spendTrend.footerAllTimeOrders')}
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
          </DashboardWidgetPanel>
        ) : null}

        {/* Col 3 — Restaurant: reorder | Supplier: low stock */}
        {(isSupplier || showRestaurantSection('showReorderAlerts')) && (
          <DashboardWidgetPanel
            title={
              isSupplier
                ? t('widgets.stockAlerts.lowStockTitle')
                : t('widgets.stockAlerts.reorderTitle')
            }
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
                  {t('widgets.recentOrders.viewAll')}
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
                  {t('widgets.recentOrders.viewAll')}
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
                    {t('widgets.stockAlerts.allAboveThreshold')}
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
                          {item.product_name ||
                            item.name ||
                            t('widgets.stockAlerts.productFallback')}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                          {item.low_stock_threshold != null
                            ? t('widgets.stockAlerts.availableWithThreshold', {
                                qty: item.available_qty ?? 0,
                                threshold: item.low_stock_threshold,
                              })
                            : t('widgets.stockAlerts.available', {
                                qty: item.available_qty ?? 0,
                              })}
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
                    {t('widgets.stockAlerts.noSuggestions')}
                  </p>
                ) : (
                  reorderSuggestions!.suggestions.slice(0, 3).map((s: any, idx: number) => {
                    const coverageDays = (Number(s.lead_time_days) || 7) + 14
                    const productId = String(s.product_id || s.productId || '')
                    const aiRec = productId ? aiRecByProduct[productId] : undefined
                    const heuristicQty =
                      s.suggested_reorder_qty != null
                        ? Math.ceil(Number(s.suggested_reorder_qty))
                        : Math.max(
                            Number(s.moq) || 1,
                            Math.ceil(
                              (Number(s.avg_daily_usage_30day) || 0) * coverageDays -
                                (Number(s.current_qty) || 0)
                            )
                          )
                    const qty =
                      aiRec?.recommendedQuantity != null && aiRec.recommendedQuantity > 0
                        ? aiRec.recommendedQuantity
                        : heuristicQty
                    // Only label after ai-recommend responds; never claim heuristic-only as AI
                    const sourceLabel =
                      aiRec?.source === 'ai'
                        ? 'AI Reorder Recommendation'
                        : aiRec
                          ? 'Forecast Reorder Recommendation'
                          : null
                    const urgencyColor =
                      idx === 0 ? 'var(--red)' : idx === 1 ? 'var(--amber)' : 'var(--mint-mid)'
                    const isAdding = addingSuggestionId === s.id

                    const handleAdd = async () => {
                      const lists = quickListsData?.quickLists || []
                      if (lists.length === 0) {
                        toast.error(t('toast.createQuickListFirst'))
                        return
                      }
                      setAddingSuggestionId(s.id)
                      try {
                        await addItemToQuickList({
                          quickListId: lists[0].id,
                          body: {
                            productId: s.product_id,
                            supplierId: aiRec?.supplierId || s.supplier_id,
                            quantity: qty,
                          },
                        }).unwrap()
                        toast.success(
                          t('toast.addedToQuickList', {
                            productName: s.product_name,
                            qty,
                            listName: lists[0].name,
                          })
                        )
                      } catch (e: any) {
                        toast.error(e?.data?.error?.message || t('toast.addToQuickListFailed'))
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
                            {t('widgets.stockAlerts.currentSuggest', {
                              current: s.current_qty,
                              suggest: qty,
                            })}
                          </div>
                          {sourceLabel && (
                            <div
                              style={{
                                fontSize: 10,
                                marginTop: 2,
                                color:
                                  aiRec?.source === 'ai' ? 'var(--mint-mid)' : 'var(--text-muted)',
                                fontWeight: 600,
                              }}
                              data-testid="dashboard-reorder-source-label"
                            >
                              {sourceLabel}
                            </div>
                          )}
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
                          {isAdding ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            t('widgets.stockAlerts.addButton')
                          )}
                        </button>
                      </div>
                    )
                  })
                )}
              </div>
            ) : null}
          </DashboardWidgetPanel>
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
            <DashboardWidgetPanel
              title={t('widgets.expiry.title')}
              action={
                <Link
                  to="/app/inventory?tab=expiry"
                  style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}
                >
                  {t('widgets.recentOrders.viewAll')}
                </Link>
              }
            >
              <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {t('widgets.expiry.expiringSoon')}
                  </div>
                  <div style={{ fontWeight: 800, fontSize: 20 }}>
                    {expirySummaryData.summary.expiringSoonCount ?? 0}
                  </div>
                </div>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {t('widgets.expiry.expired')}
                  </div>
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
            </DashboardWidgetPanel>
          ) : null}

          {isRestaurant &&
          smartReorderEnabled &&
          (reorderRemindersData?.reminders?.length ?? 0) > 0 ? (
            <DashboardWidgetPanel
              title={t('widgets.reorderReminders.title')}
              action={
                <Link
                  to="/app/quick-lists"
                  style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}
                >
                  {t('widgets.reorderReminders.orderingLists')}
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
                        {t('widgets.reorderReminders.pattern', {
                          label: r.label,
                          dayName: r.dayName,
                        })}
                      </li>
                    )
                  )}
              </ul>
            </DashboardWidgetPanel>
          ) : null}

          {isSupplier && (atRiskData?.atRisk?.length ?? 0) > 0 ? (
            <DashboardWidgetPanel
              title={t('widgets.atRisk.title')}
              action={
                <Link
                  to="/app/command-center"
                  style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}
                >
                  {t('widgets.atRisk.commandCenter')}
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
                        {t('widgets.atRisk.pattern', {
                          restaurantName: r.restaurantName,
                          label: r.label,
                          dayName: r.dayName,
                        })}
                      </li>
                    )
                  )}
              </ul>
            </DashboardWidgetPanel>
          ) : null}

          {isSupplier && growthMetrics ? (
            <DashboardWidgetPanel
              title={t('widgets.customerGrowth.title')}
              action={
                <Link
                  to="/app/customer-growth"
                  style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}
                >
                  {t('widgets.customerGrowth.manage')}
                </Link>
              }
            >
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-[var(--text-muted)]">
                    {t('widgets.customerGrowth.imported')}
                  </span>
                  <div className="font-semibold">{growthMetrics.importedCustomers}</div>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">
                    {t('widgets.customerGrowth.converted')}
                  </span>
                  <div className="font-semibold">{growthMetrics.convertedCustomers}</div>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">
                    {t('widgets.customerGrowth.invited')}
                  </span>
                  <div className="font-semibold">{growthMetrics.invitedCustomers}</div>
                </div>
                <div>
                  <span className="text-[var(--text-muted)]">
                    {t('widgets.customerGrowth.rewards')}
                  </span>
                  <div className="font-semibold flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {t('widgets.customerGrowth.freeMonths', {
                      count: growthMetrics.rewardsEarned.freeMonths,
                    })}
                  </div>
                </div>
              </div>
            </DashboardWidgetPanel>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
