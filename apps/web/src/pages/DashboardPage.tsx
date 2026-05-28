import { Link, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import {
  useGetDashboardStatsQuery,
  useGetOrdersQuery,
  useGetReorderSuggestionsQuery,
  useGetInvoiceAnalyticsQuery,
  useGetQuickListsQuery,
  useAddItemToQuickListMutation,
  useGetImpersonationStatusQuery,
  useGetEntitlementsQuery,
  useGetInventoryListQuery,
} from '../services/api'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import {
  Package,
  ShoppingCart,
  Users,
  Building2,
  DollarSign,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Warehouse,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { ResponsiveContainer, BarChart, Bar, Tooltip } from 'recharts'
import { useState } from 'react'
import { useAppSelector } from '../hooks/redux'
import { featureEnabled } from '../lib/planLimits'
import { canUseFinanceInvoices, canUseGlobalReports } from '../lib/planFeatureGates'
import { formatPlanDisplayName } from '../lib/planComparison'
/** Vertical rhythm between dashboard sections (KPIs, cards row, calendar). */
const DASHBOARD_STACK_GAP = 24
/** Horizontal gap between KPI cards and between the three content cards. */
const DASHBOARD_GRID_GAP = 20
/** Extra space above the calendar so it separates clearly from the cards row. */
const DASHBOARD_CALENDAR_EXTRA_GAP = 12
import { CalendarView } from '../components/CalendarView'
import { formatCurrency } from '../utils/format'

// ─── Tiny helpers ────────────────────────────────────────────────────────────

const SPEND_TREND_DAYS = 30

function buildOrderSpendTrend(orders: any[], days = SPEND_TREND_DAYS) {
  const cutoff = new Date()
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - days)
  const buckets = new Map<string, number>()
  for (const o of orders) {
    const raw = o.created_at || o.createdAt
    if (!raw) continue
    const d = new Date(raw)
    if (Number.isNaN(d.getTime()) || d < cutoff) continue
    const key = raw.slice(5, 10)
    buckets.set(key, (buckets.get(key) || 0) + (Number(o.total_amount) || 0))
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => ({ name, value }))
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data, 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 26, marginTop: 8 }}>
      {data.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${Math.max(12, Math.round((v / max) * 100))}%`,
            borderRadius: '2px 2px 0 0',
            background: color,
            opacity: 0.25 + (i / data.length) * 0.75,
          }}
        />
      ))}
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const s = (status || '').toUpperCase()
  const map: Record<string, [string, string]> = {
    PLACED: ['var(--brand-pale)', 'var(--brand-mid)'],
    PENDING: ['var(--amber-pale)', 'var(--amber)'],
    PROCESSING: ['var(--amber-pale)', 'var(--amber)'],
    SHIPPED: ['var(--mint-pale)', 'var(--mint)'],
    COMPLETED: ['var(--mint-pale)', 'var(--mint)'],
    CANCELLED: ['var(--red-pale)', 'var(--red)'],
  }
  const [bg, color] = map[s] || ['var(--brand-pale)', 'var(--brand-mid)']
  return (
    <span
      style={{
        background: bg,
        color,
        fontSize: 10,
        fontWeight: 700,
        borderRadius: 6,
        padding: '2px 7px',
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {s}
    </span>
  )
}

interface KpiCardProps {
  label: string
  value: string | number
  iconBg: string
  iconColor: string
  Icon: any
  meta?: string
  sparkData: number[]
  sparkColor: string
}

function KpiCard({
  label,
  value,
  iconBg,
  iconColor,
  Icon,
  meta,
  sparkData,
  sparkColor,
}: KpiCardProps) {
  return (
    <div
      className="kpi-card"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 12,
        padding: 15,
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(-1px)'
        el.style.boxShadow = '0 6px 20px rgba(91,33,182,0.12)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = ''
        el.style.boxShadow = ''
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          {label}
        </span>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: iconBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon size={15} style={{ color: iconColor }} />
        </div>
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, color: 'var(--text)', lineHeight: 1.1 }}>
        {value === 0 || value === '0' || value === '$0.00' || value === formatCurrency(0) ? (
          <span>{value}</span>
        ) : (
          value
        )}
      </div>
      {meta && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{meta}</div>}
      <Sparkline data={sparkData} color={sparkColor} />
    </div>
  )
}

function SectionCard({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--app-border)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '12px 15px 10px',
          borderBottom: '1px solid var(--app-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: 'var(--text-mid)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          {title}
        </span>
        {action}
      </div>
      <div style={{ padding: '12px 15px' }}>{children}</div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DashboardPage() {
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const { data: impersonation } = useGetImpersonationStatusQuery(undefined, {
    skip: user?.role !== 'ADMIN',
  })
  const isAdminNotImpersonating = user?.role === 'ADMIN' && !impersonation?.active

  useEffect(() => {
    if (isAdminNotImpersonating) {
      navigate('/app/admin', { replace: true })
    }
  }, [isAdminNotImpersonating, navigate])
  const {
    data: stats,
    isLoading,
    error,
  } = useGetDashboardStatsQuery(undefined, {
    skip: isAdminNotImpersonating,
  })

  const effectiveRole =
    user?.role === 'ADMIN' && impersonation?.active ? impersonation.tenantType : user?.role
  const isRestaurant = effectiveRole === 'RESTAURANT'
  const isSupplier = effectiveRole === 'SUPPLIER'

  const { data: recentOrders } = useGetOrdersQuery(
    { limit: 7, offset: 0 },
    { skip: isAdminNotImpersonating }
  )
  const { data: spendOrdersData } = useGetOrdersQuery(
    { limit: 200, offset: 0 },
    { skip: isAdminNotImpersonating || !isRestaurant }
  )
  const { data: inventoryData } = useGetInventoryListQuery(undefined, {
    skip: isAdminNotImpersonating || !isSupplier,
  })
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !user || user.role === 'ADMIN',
  })
  const smartReorderEnabled = featureEnabled(
    entitlementsData?.entitlements?.features?.smart_reorder
  )
  const reportsEnabled = canUseGlobalReports(entitlementsData?.entitlements)
  const { data: reorderSuggestions } = useGetReorderSuggestionsQuery(undefined, {
    skip: !isRestaurant || !smartReorderEnabled,
  })
  const { data: quickListsData } = useGetQuickListsQuery(undefined, {
    skip: !isRestaurant,
  })
  const [addItemToQuickList] = useAddItemToQuickListMutation()
  const [addingSuggestionId, setAddingSuggestionId] = useState<string | null>(null)
  const financeInvoicesEnabled = canUseFinanceInvoices(entitlementsData?.entitlements)
  const { data: invoiceAnalytics } = useGetInvoiceAnalyticsQuery(
    { period: 30 },
    { skip: !isRestaurant || !financeInvoicesEnabled }
  )
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d')

  const planName = formatPlanDisplayName(
    entitlementsData?.entitlements?.plan?.code,
    entitlementsData?.entitlements?.plan?.name
  )
  const firstName = (user?.displayName || user?.email || '').split(/[\s@]/)[0] || 'there'

  const now = new Date()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const formattedDate = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div
        style={{ display: 'flex', flexDirection: 'column', gap: DASHBOARD_STACK_GAP }}
        data-testid="dashboard-page"
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Skeleton className="h-7 w-48" style={{ background: 'var(--brand-ultra)' }} />
            <Skeleton className="h-4 w-64" style={{ background: 'var(--brand-ultra)' }} />
          </div>
          <Skeleton className="h-8 w-36" style={{ background: 'var(--brand-ultra)' }} />
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: DASHBOARD_GRID_GAP,
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--app-border)',
                borderRadius: 12,
                padding: 15,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <Skeleton className="h-3 w-20" style={{ background: 'var(--brand-ultra)' }} />
              <Skeleton className="h-8 w-16" style={{ background: 'var(--brand-ultra)' }} />
              <Skeleton className="h-6 w-full" style={{ background: 'var(--brand-ultra)' }} />
            </div>
          ))}
        </div>
        <div
          style={{ display: 'grid', gridTemplateColumns: '5fr 3fr 4fr', gap: DASHBOARD_GRID_GAP }}
        >
          <Skeleton className="h-64 rounded-xl" style={{ background: 'var(--brand-ultra)' }} />
          <Skeleton className="h-64 rounded-xl" style={{ background: 'var(--brand-ultra)' }} />
          <Skeleton className="h-64 rounded-xl" style={{ background: 'var(--brand-ultra)' }} />
        </div>
        <Skeleton className="h-48 rounded-xl" style={{ background: 'var(--brand-ultra)' }} />
      </div>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div style={{ textAlign: 'center', paddingTop: 64 }} data-testid="dashboard-page">
        <AlertTriangle size={32} style={{ color: 'var(--brand)', margin: '0 auto 12px' }} />
        <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
          Failed to load dashboard
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Please try refreshing the page</p>
      </div>
    )
  }

  // ── Derived data ─────────────────────────────────────────────────────────
  const orders = recentOrders?.orders || []
  const orderAmounts = orders.map((o: any) => Number(o.total_amount) || 0)
  const syntheticRamp = (n: number, peak: number) =>
    Array.from({ length: 7 }, (_, i) =>
      Math.round((peak || 100) * (0.3 + (i / 6) * 0.7) * (0.7 + Math.random() * 0.3))
    ).slice(0, n)
  const revenueSparkData =
    orderAmounts.length >= 4
      ? [...orderAmounts.slice(-7).reverse()]
      : syntheticRamp(7, (stats?.totalRevenue as number) || 500)
  const ordersSparkData = syntheticRamp(7, (stats?.totalOrders as number) || 10)
  const pendingSparkData = syntheticRamp(7, (stats?.pendingOrders as number) || 5)
  const counterpartSparkData = syntheticRamp(
    7,
    ((isSupplier ? stats?.totalRestaurants : stats?.totalSuppliers) as number) || 5
  )

  const invoiceSpendTrend = Array.isArray(invoiceAnalytics?.points)
    ? invoiceAnalytics.points.map((p: any) => ({
        name: p.date?.slice(5) || '',
        value: Number(p.total) || 0,
      }))
    : []
  const orderSpendTrend = buildOrderSpendTrend(spendOrdersData?.orders || [])
  const spendTrendSource: 'invoices' | 'orders' | null =
    invoiceSpendTrend.length > 0 ? 'invoices' : orderSpendTrend.length > 0 ? 'orders' : null
  const spendTrend = spendTrendSource === 'invoices' ? invoiceSpendTrend : orderSpendTrend
  const spendTrendPeriodTotal = spendTrend.reduce((sum, p) => sum + p.value, 0)
  const lowStockItems = (inventoryData?.inventory || [])
    .filter((item: any) => item.isLowStock)
    .slice(0, 3)

  // ── KPI definitions ──────────────────────────────────────────────────────
  const supplierKpis: KpiCardProps[] = [
    {
      label: 'Revenue',
      value: typeof stats?.totalRevenue === 'number' ? formatCurrency(stats.totalRevenue) : '$0',
      iconBg: 'var(--brand-pale)',
      iconColor: 'var(--brand)',
      Icon: DollarSign,
      meta: 'All-time',
      sparkData: revenueSparkData,
      sparkColor: 'var(--brand)',
    },
    {
      label: 'Orders',
      value: stats?.totalOrders ?? 0,
      iconBg: 'var(--mint-pale)',
      iconColor: 'var(--mint)',
      Icon: ShoppingCart,
      meta: 'All orders',
      sparkData: ordersSparkData,
      sparkColor: 'var(--mint-mid)',
    },
    {
      label: 'Pending',
      value: stats?.pendingOrders ?? 0,
      iconBg: 'var(--amber-pale)',
      iconColor: 'var(--amber)',
      Icon: TrendingUp,
      meta: 'Awaiting fulfillment',
      sparkData: pendingSparkData,
      sparkColor: 'var(--amber-mid)',
    },
    {
      label: 'Restaurants',
      value: stats?.totalRestaurants ?? 0,
      iconBg: 'var(--brand-pale)',
      iconColor: 'var(--brand)',
      Icon: Users,
      meta: 'Active customers',
      sparkData: counterpartSparkData,
      sparkColor: 'var(--brand-light)',
    },
  ]

  const restaurantKpis: KpiCardProps[] = [
    {
      label: 'Total Spent',
      value: typeof stats?.totalSpent === 'number' ? formatCurrency(stats.totalSpent) : '$0',
      iconBg: 'var(--brand-pale)',
      iconColor: 'var(--brand)',
      Icon: DollarSign,
      meta: 'All-time',
      sparkData: revenueSparkData,
      sparkColor: 'var(--brand)',
    },
    {
      label: 'My Orders',
      value: stats?.totalOrders ?? 0,
      iconBg: 'var(--mint-pale)',
      iconColor: 'var(--mint)',
      Icon: ShoppingCart,
      meta: 'All orders',
      sparkData: ordersSparkData,
      sparkColor: 'var(--mint-mid)',
    },
    {
      label: 'Pending',
      value: stats?.pendingOrders ?? 0,
      iconBg: 'var(--amber-pale)',
      iconColor: 'var(--amber)',
      Icon: TrendingUp,
      meta: 'In progress',
      sparkData: pendingSparkData,
      sparkColor: 'var(--amber-mid)',
    },
    {
      label: 'Suppliers',
      value: stats?.totalSuppliers ?? 0,
      iconBg: 'var(--brand-pale)',
      iconColor: 'var(--brand)',
      Icon: Building2,
      meta: 'Active vendors',
      sparkData: counterpartSparkData,
      sparkColor: 'var(--brand-light)',
    },
  ]

  const kpis = isSupplier ? supplierKpis : restaurantKpis

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div
      data-testid="dashboard-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: DASHBOARD_STACK_GAP,
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Post-onboarding CTAs */}
      {isRestaurant && (stats?.totalOrders ?? 0) === 0 && (
        <div
          style={{
            background: 'var(--brand-pale)',
            border: '1px solid var(--brand-light)',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              You&apos;re all set
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Create your first order to start receiving from suppliers.
            </div>
          </div>
          <Button
            asChild
            style={{
              background: 'var(--brand)',
              borderColor: 'var(--brand)',
              color: '#fff',
              flexShrink: 0,
            }}
          >
            <Link to="/app/cart">
              <ShoppingCart style={{ width: 14, height: 14, marginRight: 6 }} />
              Create first order
            </Link>
          </Button>
        </div>
      )}
      {isSupplier && (stats?.totalProducts ?? 0) === 0 && (
        <div
          style={{
            background: 'var(--brand-pale)',
            border: '1px solid var(--brand-light)',
            borderRadius: 12,
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
              You&apos;re all set
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Add your first product so restaurants can order from you.
            </div>
          </div>
          <Button
            asChild
            style={{
              background: 'var(--brand)',
              borderColor: 'var(--brand)',
              color: '#fff',
              flexShrink: 0,
            }}
          >
            <Link to="/app/products">
              <Package style={{ width: 14, height: 14, marginRight: 6 }} />
              Add first product
            </Link>
          </Button>
        </div>
      )}

      {/* Page heading */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: 21, fontWeight: 900, color: 'var(--text)', margin: 0 }}>
            {greeting}, {firstName} ☀️
          </h1>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            {formattedDate} &nbsp;·&nbsp; {effectiveRole?.toLowerCase() ?? 'user'} &nbsp;·&nbsp;{' '}
            {planName}
          </p>
        </div>
        {/* Period selector — UI only */}
        <div
          style={{
            display: 'flex',
            background: 'var(--surface)',
            border: '1px solid var(--app-border)',
            borderRadius: 8,
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {(['7d', '30d', '90d'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 600,
                fontFamily: 'inherit',
                border: 'none',
                cursor: 'pointer',
                background: period === p ? 'var(--brand)' : 'transparent',
                color: period === p ? '#fff' : 'var(--text-muted)',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPI grid — 4 columns */}
      <div
        style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: DASHBOARD_GRID_GAP }}
      >
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* 3-col content row */}
      <div style={{ display: 'grid', gridTemplateColumns: '5fr 3fr 4fr', gap: DASHBOARD_GRID_GAP }}>
        {/* Col 1 — Recent Orders */}
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
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 4px',
                    borderBottom: '1px solid var(--app-border)',
                    textDecoration: 'none',
                    gap: 8,
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
                    <StatusChip status={o.status} />
                  </div>
                </Link>
              ))
            )}
          </div>
        </SectionCard>

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
                          width: `${pct}%`,
                          background: color,
                          borderRadius: 4,
                          transition: 'width 0.4s ease',
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
        ) : (
          <SectionCard
            title="Spend Trend"
            action={<span style={{ fontSize: 10, color: 'var(--text-muted)' }}>30 days</span>}
          >
            {spendTrend.length > 0 ? (
              <div style={{ height: 120 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={spendTrend}
                    margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                    barSize={4}
                  >
                    <Bar
                      dataKey="value"
                      fill="var(--brand-mid)"
                      radius={[2, 2, 0, 0]}
                      opacity={0.75}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--surface)',
                        border: '1px solid var(--app-border)',
                        borderRadius: 6,
                        fontSize: 11,
                        color: 'var(--text)',
                      }}
                      formatter={(v: any) => [formatCurrency(v), 'Spend']}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
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
        )}

        {/* Col 3 — Restaurant: reorder | Supplier: low stock */}
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
            ) : isRestaurant && (reorderSuggestions?.suggestions?.length ?? 0) > 0 ? (
              <Link
                to="/app/quick-lists"
                style={{
                  fontSize: 11,
                  color: 'var(--brand)',
                  textDecoration: 'none',
                  fontWeight: 600,
                }}
              >
                Add all →
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
                        body: { productId: s.product_id, supplierId: s.supplier_id, quantity: qty },
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
                        disabled={isAdding}
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
      </div>

      {/* Calendar row */}
      <div
        style={{
          marginTop: DASHBOARD_CALENDAR_EXTRA_GAP,
          background: 'var(--surface)',
          border: '1px solid var(--app-border)',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        <CalendarView role={effectiveRole ?? null} isAdmin={user?.role === 'ADMIN'} />
      </div>
    </div>
  )
}
