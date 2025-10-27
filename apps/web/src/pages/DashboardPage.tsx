import { useGetDashboardStatsQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Package, ShoppingCart, Users, Building2, DollarSign, TrendingUp } from 'lucide-react'

export function DashboardPage() {
  const { data: stats, isLoading, error } = useGetDashboardStatsQuery()

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
        <p className="text-red-600 text-lg font-semibold mb-2">Failed to load dashboard stats</p>
        <p className="text-gray-600 text-sm">Please try refreshing the page</p>
      </div>
    )
  }

  // Debug: Show what we have
  console.log('Dashboard stats:', stats)
  console.log('Dashboard isLoading:', isLoading)
  console.log('Dashboard error:', error)
  console.log('Dashboard data keys:', stats ? Object.keys(stats) : 'no stats')

  // Always show default cards, then add stats if available
  const statCards: any[] = [
    {
      title: 'All Products',
      value: stats?.totalProducts ?? 0,
      icon: Package,
      description: 'Products available',
    },
    {
      title: 'My Orders',
      value: stats?.totalOrders ?? 0,
      icon: ShoppingCart,
      description: 'Orders placed',
    },
    {
      title: 'Pending Orders',
      value: stats?.pendingOrders ?? 0,
      icon: TrendingUp,
      description: 'Orders in progress',
    },
    {
      title: 'Completed Orders',
      value: stats?.completedOrders ?? 0,
      icon: Package,
      description: 'Orders completed',
    }
  ]
  
  // Add Total Spent for restaurants
  if (stats?.totalSpent !== undefined && stats.totalSpent > 0) {
    statCards.push({
      title: 'Total Spent',
      value: `$${stats.totalSpent.toFixed(2)}`,
      icon: DollarSign,
      description: 'Amount spent',
    })
  }
  
  // Add role-specific cards if present
  if (stats?.totalSuppliers !== undefined) {
    statCards.push({
      title: 'Total Suppliers',
      value: stats.totalSuppliers,
      icon: Building2,
      description: 'Active suppliers',
    })
  }

  if (stats?.totalRestaurants !== undefined) {
    statCards.push({
      title: 'Total Restaurants',
      value: stats.totalRestaurants,
      icon: Users,
      description: 'Active restaurants',
    })
  }

  if (stats?.totalRevenue !== undefined && stats.totalRevenue !== stats.totalSpent) {
    statCards.push({
      title: 'Total Revenue',
      value: `$${stats.totalRevenue.toLocaleString()}`,
      icon: DollarSign,
      description: 'Platform revenue',
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Overview of your Supplify marketplace activity
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {card.title}
              </CardTitle>
              <card.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">
                {card.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Latest updates from your marketplace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center space-x-4">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">System Online</p>
                  <p className="text-xs text-gray-500">All services running normally</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <div className="flex-1">
                  <p className="text-sm font-medium">Welcome to Supplify</p>
                  <p className="text-xs text-gray-500">Your marketplace is ready</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common tasks and shortcuts
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <a
                href="/app/products"
                className="block p-3 rounded-md border hover:bg-gray-50 transition-colors"
              >
                <p className="text-sm font-medium">Browse Products</p>
                <p className="text-xs text-gray-500">View and search products</p>
              </a>
              <a
                href="/app/orders"
                className="block p-3 rounded-md border hover:bg-gray-50 transition-colors"
              >
                <p className="text-sm font-medium">View Orders</p>
                <p className="text-xs text-gray-500">Manage your orders</p>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
