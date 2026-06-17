import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useGetOrdersQuery, useGetRestaurantsQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { useAppSelector } from '../hooks/redux'
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  ArrowLeft,
  Pin,
  ShoppingCart,
  DollarSign,
  TrendingUp,
  Package,
  Calendar,
  Activity,
  MessageSquare,
} from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { formatPrice } from '../utils/format'
import { CardAddressBlock } from '../components/ui/card-layout'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'

export function RestaurantDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const [isPinned, setIsPinned] = useState(false)

  const { data: restaurantsData } = useGetRestaurantsQuery({ limit: 1000, offset: 0 })
  const { data: ordersData } = useGetOrdersQuery({ limit: 1000, offset: 0 })

  const restaurant = restaurantsData?.restaurants.find((r) => r.id === id)

  // Get all orders for this restaurant
  const restaurantOrders = useMemo(() => {
    if (!ordersData?.orders) return []
    return ordersData.orders.filter((order) => order.restaurant_id === id)
  }, [ordersData, id])

  // Calculate statistics
  const stats = useMemo(() => {
    const totalOrders = restaurantOrders.length
    const totalSpent = restaurantOrders.reduce((sum, order) => {
      const amount =
        typeof order.total_amount === 'number'
          ? order.total_amount
          : parseFloat(order.total_amount || 0)
      return sum + (isNaN(amount) ? 0 : amount)
    }, 0)
    const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0

    // Get most purchased products
    const productCount = new Map<
      string,
      { name: string; sku: string; totalQuantity: number; totalRevenue: number }
    >()

    restaurantOrders.forEach((order) => {
      order.items?.forEach((item: any) => {
        if (!productCount.has(item.product_id)) {
          productCount.set(item.product_id, {
            name: item.product_name || 'Unknown Product',
            sku: item.product_sku || 'N/A',
            totalQuantity: 0,
            totalRevenue: 0,
          })
        }
        const product = productCount.get(item.product_id)!
        const quantity =
          typeof item.quantity === 'number' ? item.quantity : parseFloat(item.quantity || 0)
        const lineTotal =
          typeof item.line_total === 'number' ? item.line_total : parseFloat(item.line_total || 0)
        product.totalQuantity += isNaN(quantity) ? 0 : quantity
        product.totalRevenue += isNaN(lineTotal) ? 0 : lineTotal
      })
    })

    const mostPurchasedProducts = Array.from(productCount.values())
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 5)

    // Get order trend (last 6 months)
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const recentOrders = restaurantOrders.filter((order) => {
      const orderDate = new Date(order.placed_at || order.created_at)
      return orderDate >= sixMonthsAgo
    }).length

    return {
      totalOrders,
      totalSpent,
      averageOrderValue,
      mostPurchasedProducts,
      recentOrders,
    }
  }, [restaurantOrders])

  const handlePinToggle = () => {
    setIsPinned(!isPinned)
    toast.success(!isPinned ? 'Restaurant pinned' : 'Restaurant unpinned')
  }

  if (!restaurant) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--text-muted)]">Restaurant not found</p>
        <Button onClick={() => navigate('/app/restaurants')} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Restaurants
        </Button>
      </div>
    )
  }

  return (
    <PageShell data-testid="restaurant-detail-page">
      <PageHeader
        title={restaurant.name}
        description={restaurant.slug}
        breadcrumb={
          <Button variant="outline" size="sm" onClick={() => navigate('/app/restaurants')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {user?.role === 'SUPPLIER' && (
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate(`/app/chat?restaurant=${restaurant.id}`)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Message
              </Button>
            )}
            <Button variant={isPinned ? 'default' : 'outline'} size="sm" onClick={handlePinToggle}>
              <Pin className="h-4 w-4 mr-2" />
              {isPinned ? 'Pinned' : 'Pin Restaurant'}
            </Button>
          </div>
        }
      />

      {/* Contact Information */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-[var(--text-muted)]" />
              <span>{restaurant.contact_email}</span>
            </div>
            {restaurant.phone && (
              <div className="flex items-center space-x-2">
                <Phone className="h-4 w-4 text-[var(--text-muted)]" />
                <span>{restaurant.phone}</span>
              </div>
            )}
            <CardAddressBlock
              address={restaurant.address_json}
              icon={MapPin}
              className="md:col-span-2"
            />
            {restaurant.trade_license_no && (
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-[var(--text-muted)]" />
                <span>License: {restaurant.trade_license_no}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-[var(--text-muted)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalOrders}</div>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {stats.recentOrders} in last 6 months
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-[var(--text-muted)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(stats.totalSpent)}</div>
            <p className="text-xs text-[var(--text-muted)] mt-1">Lifetime value</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Average Order</CardTitle>
            <TrendingUp className="h-4 w-4 text-[var(--text-muted)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatPrice(stats.averageOrderValue)}</div>
            <p className="text-xs text-[var(--text-muted)] mt-1">Per order</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Member Since</CardTitle>
            <Calendar className="h-4 w-4 text-[var(--text-muted)]" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-base">
              {format(new Date(restaurant.created_at), 'MMM yyyy')}
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1">Customer since</p>
          </CardContent>
        </Card>
      </div>

      {/* Most Purchased Products */}
      <Card>
        <CardHeader>
          <CardTitle>Top Products</CardTitle>
          <CardDescription>Most frequently purchased products</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {stats.mostPurchasedProducts.length > 0 ? (
              stats.mostPurchasedProducts.map((product, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg"
                >
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 rounded-full bg-[var(--brand-pale)] flex items-center justify-center">
                      <Package className="h-4 w-4 text-[var(--brand-mid)]" />
                    </div>
                    <div>
                      <p className="font-medium">{product.name}</p>
                      <p className="text-sm text-[var(--text-muted)]">SKU: {product.sku}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {typeof product.totalQuantity === 'number' ? product.totalQuantity : 0} units
                    </p>
                    <p className="text-sm text-[var(--text-muted)]">
                      {formatPrice(product.totalRevenue)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-[var(--text-muted)] text-center py-4">No products purchased yet</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>Latest orders from this restaurant</CardDescription>
            </div>
            <Button size="sm" onClick={() => navigate(`/app/orders?restaurant=${restaurant.id}`)}>
              View All Orders
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {restaurantOrders.slice(0, 5).map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-medium">Order #{order.id.substring(0, 8)}</p>
                  <p className="text-sm text-[var(--text-muted)]">
                    {format(new Date(order.placed_at || order.created_at), 'MMM dd, yyyy')}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant={order.status === 'COMPLETED' ? 'default' : 'secondary'}>
                    {order.status}
                  </Badge>
                  <p className="text-sm font-medium mt-1">{formatPrice(order.total_amount)}</p>
                </div>
              </div>
            ))}
            {restaurantOrders.length === 0 && (
              <p className="text-[var(--text-muted)] text-center py-4">No orders yet</p>
            )}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  )
}
