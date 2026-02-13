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
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
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
        value: `$${Number(stats.totalRevenue).toLocaleString()}`,
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
        value: `$${stats.totalSpent.toFixed(2)}`,
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
    <div className="space-y-6">
      <div className="rounded-2xl p-6 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white shadow-sm">
        <h1 className="text-3xl font-bold">
          {isSupplier ? 'Supplier Dashboard' : isRestaurant ? 'Restaurant Dashboard' : 'Dashboard'}
        </h1>
        <p className="mt-2 opacity-90">Clear, visual insights tailored to your role</p>
        {(hasRevenue || hasSpend) && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {hasRevenue && (
              <div className="rounded-xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide opacity-80">Revenue</p>
                <p className="text-lg font-semibold">
                  ${Number(stats.totalRevenue).toLocaleString()}
                </p>
              </div>
            )}
            {hasSpend && (
              <div className="rounded-xl bg-white/10 p-4">
                <p className="text-xs uppercase tracking-wide opacity-80">Total Spent</p>
                <p className="text-lg font-semibold">${stats.totalSpent.toFixed(2)}</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {kpis.map((kpi) => (
          <Card
            key={kpi.title}
            className="transition-transform hover:shadow-md hover:-translate-y-0.5"
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              <kpi.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p className="text-xs text-muted-foreground">{kpi.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <CalendarView role={effectiveRole ?? null} isAdmin={user?.role === 'ADMIN'} />

      <div className="grid gap-6 xl:grid-cols-[2fr,1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>
                Last 5 orders {isSupplier ? 'from your customers' : 'you placed'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={recentOrderData}
                    margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="amountGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                    <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                    <YAxis tickLine={false} axisLine={false} fontSize={12} width={48} />
                    <Tooltip cursor={{ stroke: '#6366f1', strokeWidth: 1 }} />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#6366f1"
                      fillOpacity={1}
                      fill="url(#amountGradient)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="divide-y">
                {recentOrders?.orders?.length ? (
                  recentOrders.orders.map((o: any) => (
                    <a
                      key={o.id}
                      href={`/app/orders/${o.id}`}
                      className="flex items-center justify-between py-3 hover:bg-gray-50 rounded-md px-2 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium">Order #{o.id.slice(0, 8)}</p>
                        <p className="text-xs text-gray-500">{o.status}</p>
                      </div>
                      <div className="text-sm font-semibold">
                        ${o.total_amount?.toFixed ? o.total_amount.toFixed(2) : o.total_amount}
                      </div>
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground py-2">No recent orders</p>
                )}
              </div>
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
