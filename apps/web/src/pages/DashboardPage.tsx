import { Link } from 'react-router-dom'
import {
  useGetDashboardStatsQuery,
  useGetOrdersQuery,
  useGetReorderSuggestionsQuery,
  useGetInvoiceAnalyticsQuery,
  useGetProductCategoriesQuery,
  useGetQuickListsQuery,
  useAddItemToQuickListMutation,
  useGetImpersonationStatusQuery,
} from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Skeleton } from '../components/ui/skeleton'
import { KPICard } from '../components/KPICard'
import { OrderStatusPill } from '../components/OrderStatusPill'
import {
  Package,
  ShoppingCart,
  Users,
  Building2,
  DollarSign,
  TrendingUp,
  ClipboardCheck,
  Loader2,
  Shield,
} from 'lucide-react'
import toast from 'react-hot-toast'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  AreaChart,
  Area,
} from 'recharts'
import { useState } from 'react'
import { useAppSelector } from '../hooks/redux'
import { CalendarView } from '../components/CalendarView'
import { formatCurrency } from '../utils/format'

export function DashboardPage() {
  const { user } = useAppSelector((state) => state.auth)
  const { data: impersonation } = useGetImpersonationStatusQuery(undefined, {
    skip: user?.role !== 'ADMIN',
  })
  // When admin is not impersonating, show admin CTA only (no tenant calendar/orders)
  const isAdminNotImpersonating = user?.role === 'ADMIN' && !impersonation?.active
  const {
    data: stats,
    isLoading,
    error,
  } = useGetDashboardStatsQuery(undefined, {
    skip: isAdminNotImpersonating,
  })

  // Effective role: when impersonating, show that tenant's dashboard
  const effectiveRole =
    user?.role === 'ADMIN' && impersonation?.active ? impersonation.tenantType : user?.role
  const effectiveIsRestaurant = effectiveRole === 'RESTAURANT'
  const effectiveIsSupplier = effectiveRole === 'SUPPLIER'

  // Recent orders preview (shared) — skip when admin not impersonating
  const { data: recentOrders } = useGetOrdersQuery(
    { limit: 5, offset: 0 },
    { skip: isAdminNotImpersonating }
  )
  // Orders dataset for charts
  const { data: chartOrders } = useGetOrdersQuery(
    { limit: 50, offset: 0 },
    { skip: isAdminNotImpersonating }
  )

  // Reorder suggestions for restaurants
  const { data: reorderSuggestions } = useGetReorderSuggestionsQuery(undefined, {
    skip: !effectiveIsRestaurant,
  })
  const { data: quickListsData } = useGetQuickListsQuery(undefined, {
    skip: !effectiveIsRestaurant,
  })
  const [addItemToQuickList, { isLoading: isAddingToQuickList }] = useAddItemToQuickListMutation()
  const [addingSuggestionId, setAddingSuggestionId] = useState<string | null>(null)

  // Restaurant spend analytics (30 days)
  const { data: invoiceAnalytics } = useGetInvoiceAnalyticsQuery(
    { period: 30 },
    { skip: !effectiveIsRestaurant }
  )

  // Supplier product categories for distribution
  const { data: productCategories } = useGetProductCategoriesQuery(undefined, {
    skip: !effectiveIsSupplier,
  })

  // Admin not impersonating: show simple landing, no tenant dashboard
  if (isAdminNotImpersonating) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl p-6 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-sm">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="mt-2 opacity-90">Platform management and tenant overview</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              You are viewing as platform admin
            </CardTitle>
            <CardDescription>
              Use the Admin Dashboard to manage tenants, plans, and support. To see a restaurant or
              supplier view, use &quot;Impersonate&quot; from the Admin Dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/app/admin">Open Admin Dashboard</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-lg" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 text-lg font-semibold mb-2">Failed to load dashboard</p>
        <p className="text-gray-600 text-sm">Please try refreshing the page</p>
      </div>
    )
  }

  const isSupplier = effectiveIsSupplier
  const isRestaurant = effectiveIsRestaurant

  // Build KPI cards based on role
  const kpis: Array<{ title: string; value: string | number; icon: any; description: string }> = []

  if (isSupplier) {
    kpis.push(
      {
        title: 'Products',
        value: stats?.totalProducts ?? 0,
        icon: Package,
        description: 'Active SKUs',
      },
      {
        title: 'Pending Orders',
        value: stats?.pendingOrders ?? 0,
        icon: TrendingUp,
        description: 'Awaiting fulfillment',
      },
      {
        title: 'Completed Orders',
        value: stats?.completedOrders ?? 0,
        icon: ClipboardCheck,
        description: 'Shipped & delivered',
      }
    )
    if (typeof stats?.totalRevenue === 'number') {
      kpis.push({
        title: 'Revenue',
        value: formatCurrency(stats.totalRevenue),
        icon: DollarSign,
        description: 'All-time',
      })
    }
    if (typeof stats?.totalRestaurants === 'number') {
      kpis.push({
        title: 'Restaurants',
        value: stats.totalRestaurants,
        icon: Users,
        description: 'Customers',
      })
    }
  }

  if (isRestaurant) {
    kpis.push(
      {
        title: 'Orders',
        value: stats?.totalOrders ?? 0,
        icon: ShoppingCart,
        description: 'All orders',
      },
      {
        title: 'Pending Orders',
        value: stats?.pendingOrders ?? 0,
        icon: TrendingUp,
        description: 'In progress',
      },
      {
        title: 'Completed Orders',
        value: stats?.completedOrders ?? 0,
        icon: Package,
        description: 'Received',
      }
    )
    if (typeof stats?.totalSpent === 'number') {
      kpis.push({
        title: 'Total Spent',
        value: formatCurrency(stats.totalSpent),
        icon: DollarSign,
        description: 'All-time',
      })
    }
    if (typeof stats?.totalSuppliers === 'number') {
      kpis.push({
        title: 'Suppliers',
        value: stats.totalSuppliers,
        icon: Building2,
        description: 'Active vendors',
      })
    }
  }

  // Default KPIs if role unknown
  if (!kpis.length) {
    kpis.push(
      {
        title: 'Products',
        value: stats?.totalProducts ?? 0,
        icon: Package,
        description: 'Available',
      },
      { title: 'Orders', value: stats?.totalOrders ?? 0, icon: ShoppingCart, description: 'Placed' }
    )
  }

  // Prepare simple viz data
  const recentOrderData = (recentOrders?.orders || []).map((o: any, idx: number) => ({
    name: `#${String(o.id).slice(0, 4)}`,
    amount: Number(o.total_amount) || 0,
    idx,
  }))

  const statusPieData = [
    { name: 'Pending', value: Number(stats?.pendingOrders) || 0, color: '#f59e0b' },
    { name: 'Completed', value: Number(stats?.completedOrders) || 0, color: '#10b981' },
  ]

  const hasSpend = typeof stats?.totalSpent === 'number'
  const hasRevenue = typeof stats?.totalRevenue === 'number'

  // Build orders trend (by placement order, synthetic day index)
  const ordersTrendData = (chartOrders?.orders || [])
    .slice()
    .reverse()
    .map((o: any, i: number) => ({
      name: `#${i + 1}`,
      amount: Number(o.total_amount) || 0,
    }))

  // Restaurant spend trend (from analytics API if available)
  const spendTrend = Array.isArray(invoiceAnalytics?.points)
    ? invoiceAnalytics.points.map((p: any) => ({
        name: p.date?.slice(5) || '',
        value: Number(p.total) || 0,
      }))
    : []

  // Supplier product category distribution
  const categoryDist = Array.isArray(productCategories?.categories)
    ? productCategories.categories
        .slice(0, 8)
        .map((c: any) => ({ name: c.name, value: c.display_order || 1 }))
    : []

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isSupplier
              ? 'Supplier Dashboard'
              : isRestaurant
                ? 'Restaurant Dashboard'
                : 'Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Daily snapshot and quick actions</p>
        </div>
        {isRestaurant && (
          <Button asChild size="lg" className="shrink-0">
            <Link to="/app/cart">
              <ShoppingCart className="h-4 w-4 mr-2" />
              Create Order
            </Link>
          </Button>
        )}
        {isSupplier && (
          <Button asChild size="lg" variant="outline" className="shrink-0">
            <Link to="/app/orders">
              <Package className="h-4 w-4 mr-2" />
              View Orders
            </Link>
          </Button>
        )}
      </div>

      {/* Post-onboarding: direct to first order or first product */}
      {isRestaurant && (stats?.totalOrders ?? 0) === 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">You&apos;re all set</h3>
              <p className="text-sm text-gray-600 mt-1">
                Create your first order to start receiving from suppliers.
              </p>
            </div>
            <Button asChild>
              <Link to="/app/cart">
                <ShoppingCart className="h-4 w-4 mr-2" />
                Create first order
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
      {isSupplier && (stats?.totalProducts ?? 0) === 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-gray-900">You&apos;re all set</h3>
              <p className="text-sm text-gray-600 mt-1">
                Add your first product so restaurants can order from you.
              </p>
            </div>
            <Button asChild>
              <Link to="/app/products">
                <Package className="h-4 w-4 mr-2" />
                Create first product
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <KPICard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            description={kpi.description}
            icon={kpi.icon}
          />
        ))}
      </div>

      <CalendarView role={effectiveRole ?? null} isAdmin={user?.role === 'ADMIN'} />

      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Recent Orders</CardTitle>
              <CardDescription>
                Last 5 orders {isSupplier ? 'from your customers' : 'you placed'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-gray-100">
                {recentOrders?.orders?.length ? (
                  recentOrders.orders.slice(0, 5).map((o: any) => (
                    <Link
                      key={o.id}
                      to={`/app/orders/${o.id}`}
                      className="flex items-center justify-between py-3 hover:bg-gray-50 rounded-md px-2 -mx-2 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          #{o.id.slice(-8).toUpperCase()}
                          {o.restaurant_name && (
                            <span className="text-gray-500 font-normal">
                              {' '}
                              · {o.restaurant_name}
                            </span>
                          )}
                        </p>
                        <OrderStatusPill status={o.status} className="mt-1" />
                      </div>
                      <div className="text-sm font-semibold text-gray-900 shrink-0 ml-3">
                        {formatCurrency(o.total_amount)}
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 py-6 text-center">No recent orders</p>
                )}
              </div>
              {recentOrders?.orders?.length ? (
                <Button variant="ghost" size="sm" className="w-full mt-2" asChild>
                  <Link to="/app/orders">View all orders</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Order Status</CardTitle>
              <CardDescription>Pending vs Completed</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={80}
                      innerRadius={48}
                      paddingAngle={2}
                    >
                      {statusPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                {statusPieData.map((s) => (
                  <div key={s.name} className="flex items-center gap-2">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: s.color }}
                    ></span>
                    <span className="text-gray-600">{s.name}</span>
                    <span className="ml-auto font-medium">{s.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {isRestaurant && spendTrend.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Spend Trend</CardTitle>
                <CardDescription>Last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={spendTrend}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                      <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#8b5cf6"
                        fillOpacity={1}
                        fill="url(#spendGradient)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {isSupplier && categoryDist.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Product Categories</CardTitle>
                <CardDescription>Top distribution</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={categoryDist}
                      layout="vertical"
                      margin={{ top: 10, right: 10, left: 20, bottom: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="name" width={120} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#06b6d4" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="space-y-6">
          {isSupplier &&
            (() => {
              const requiringAction = (recentOrders?.orders || []).filter(
                (o: any) => o.status === 'PLACED'
              )
              return requiringAction.length > 0 ? (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Orders Requiring Action</CardTitle>
                    <CardDescription>Awaiting your acknowledgment</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {requiringAction.slice(0, 5).map((o: any) => (
                        <Link
                          key={o.id}
                          to={`/app/orders/${o.id}`}
                          className="flex items-center justify-between py-2 px-2 rounded-md hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-colors"
                        >
                          <span className="text-sm font-medium truncate">
                            #{o.id.slice(-8).toUpperCase()} · {o.restaurant_name}
                          </span>
                          <span className="text-sm font-semibold text-amber-700">
                            {formatCurrency(o.total_amount)}
                          </span>
                        </Link>
                      ))}
                    </div>
                    <Button variant="outline" size="sm" className="w-full mt-3" asChild>
                      <Link to="/app/orders">View all</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : null
            })()}
          <Card>
            <CardHeader>
              <CardTitle>Orders Trend</CardTitle>
              <CardDescription>Amounts over recent orders</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={ordersTrendData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="ordersGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#22c55e"
                      fillOpacity={1}
                      fill="url(#ordersGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {isRestaurant && (
            <Card>
              <CardHeader>
                <CardTitle>Reorder Suggestions</CardTitle>
                <CardDescription>Top items predicted to run low</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {reorderSuggestions?.suggestions?.length ? (
                    reorderSuggestions.suggestions.slice(0, 5).map((s: any) => {
                      const qty =
                        s.suggested_reorder_qty ??
                        Math.max(1, Math.ceil(s.avg_daily_usage_30day * 3))
                      const isAdding = addingSuggestionId === s.id
                      const handleAddToQuickList = async () => {
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
                        <div key={s.id} className="flex items-center justify-between py-3">
                          <div>
                            <p className="text-sm font-medium">{s.product_name}</p>
                            <p className="text-xs text-gray-500">
                              Current: {s.current_qty} • Suggested: {qty}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-primary hover:underline"
                            disabled={isAdding}
                            onClick={handleAddToQuickList}
                          >
                            {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                            Add to Quick List
                          </Button>
                        </div>
                      )
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground py-2">No suggestions available</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
