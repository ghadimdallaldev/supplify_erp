import { useState, useMemo } from 'react'
import { useGetOrdersQuery, useGetRestaurantsQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { useNavigate } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import { Building2, Mail, Phone, MapPin, FileText, Search, Pin, BarChart3, ShoppingCart, TrendingUp, DollarSign } from 'lucide-react'
import toast from 'react-hot-toast'

export function RestaurantsPage() {
  const { user } = useAppSelector((state) => state.auth)
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const isSupplier = user?.role === 'SUPPLIER'
  
  // Get orders to find restaurants
  const { data: ordersData } = useGetOrdersQuery({
    limit: 1000,
    offset: 0,
  })
  
  // Get all restaurants
  const { data: restaurantsData, isLoading, error } = useGetRestaurantsQuery({
    limit: 1000,
    offset: 0,
  })

  // Supplier view: Show restaurants that purchased from this supplier
  const restaurantsWithOrders = useMemo(() => {
    if (!ordersData?.orders || !restaurantsData?.restaurants) return []
    
    // Get unique restaurant IDs from orders
    const restaurantIds = new Set(
      ordersData.orders
        .filter(order => order.restaurant_id)
        .map(order => order.restaurant_id)
    )
    
    // Get restaurant details and order statistics
    return Array.from(restaurantIds).map(restaurantId => {
      const restaurant = restaurantsData.restaurants.find(r => r.id === restaurantId)
      if (!restaurant) return null
      
      const restaurantOrders = ordersData.orders.filter(
        order => order.restaurant_id === restaurantId
      )
      
      const totalOrders = restaurantOrders.length
      const totalSpent = restaurantOrders.reduce((sum, order) => sum + (order.total_amount || 0), 0)
      const latestOrder = restaurantOrders.sort((a, b) => 
        new Date(b.placed_at || b.created_at).getTime() - new Date(a.placed_at || a.created_at).getTime()
      )[0]
      
      // Get most purchased products
      const productCount = new Map()
      restaurantOrders.forEach(order => {
        order.items?.forEach((item: any) => {
          productCount.set(item.product_id, (productCount.get(item.product_id) || 0) + item.quantity)
        })
      })
      
      const mostPurchasedProduct = Array.from(productCount.entries())
        .sort((a, b) => b[1] - a[1])[0]
      
      return {
        ...restaurant,
        totalOrders,
        totalSpent,
        latestOrder,
        mostPurchasedProduct,
      }
    }).filter(Boolean)
  }, [ordersData, restaurantsData])

  // Filter by search
  const filteredRestaurants = restaurantsWithOrders.filter(restaurant =>
    restaurant?.name?.toLowerCase().includes(search.toLowerCase()) ||
    restaurant?.contact_email?.toLowerCase().includes(search.toLowerCase())
  )

  // If user is not a supplier, show all restaurants
  if (!isSupplier) {
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
          <p className="text-red-600">Failed to load restaurants</p>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Restaurants</h1>
          <p className="text-gray-600 mt-2">
            Manage restaurants in the marketplace
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {restaurantsData?.restaurants.map((restaurant) => (
            <Card key={restaurant.id}>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Building2 className="h-5 w-5" />
                  <span>{restaurant.name}</span>
                </CardTitle>
                <CardDescription>
                  {restaurant.slug}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center space-x-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span>{restaurant.contact_email}</span>
                  </div>
                  {restaurant.phone && (
                    <div className="flex items-center space-x-2">
                      <Phone className="h-4 w-4 text-gray-400" />
                      <span>{restaurant.phone}</span>
                    </div>
                  )}
                  {restaurant.address_json && (
                    <div className="flex items-center space-x-2">
                      <MapPin className="h-4 w-4 text-gray-400" />
                      <span>
                        {restaurant.address_json.city}, {restaurant.address_json.country}
                      </span>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center justify-between">
                  <Badge variant="outline">
                    {restaurant.trade_license_no ? `License: ${restaurant.trade_license_no}` : 'No License'}
                  </Badge>
                  <span className="text-xs text-gray-500">
                    Joined {new Date(restaurant.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {restaurantsData?.restaurants.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No restaurants found</p>
          </div>
        )}
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
        <p className="text-red-600">Failed to load restaurants</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">My Restaurants</h1>
        <p className="text-gray-600 mt-2">
          Restaurants that purchase from you
        </p>
      </div>

      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search restaurants..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredRestaurants.map((restaurant) => (
          <Card key={restaurant.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Building2 className="h-5 w-5" />
                  <CardTitle>{restaurant.name}</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toast.info('Pin functionality coming soon')}
                    className="h-6 w-6 p-0"
                  >
                    <Pin className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardDescription>{restaurant.slug}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Contact Info */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span>{restaurant.contact_email}</span>
                </div>
                {restaurant.phone && (
                  <div className="flex items-center space-x-2">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <span>{restaurant.phone}</span>
                  </div>
                )}
                {restaurant.address_json && (
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span>
                      {restaurant.address_json.city}, {restaurant.address_json.country}
                    </span>
                  </div>
                )}
              </div>

              {/* Statistics */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-1 text-gray-600">
                    <ShoppingCart className="h-4 w-4" />
                    <span className="text-2xl font-bold">{restaurant.totalOrders}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Total Orders</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-1 text-gray-600">
                    <DollarSign className="h-4 w-4" />
                    <span className="text-2xl font-bold">${typeof restaurant.totalSpent === 'number' ? restaurant.totalSpent.toFixed(0) : '0'}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Total Spent</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center justify-center space-x-1 text-gray-600">
                    <TrendingUp className="h-4 w-4" />
                    <span className="text-lg font-semibold">
                      {restaurant.latestOrder 
                        ? new Date(restaurant.latestOrder.placed_at || restaurant.latestOrder.created_at).toLocaleDateString()
                        : 'N/A'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Last Order</p>
                </div>
              </div>

              {/* Latest Order */}
              {restaurant.latestOrder && (
                <div className="pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">Latest Order</p>
                      <p className="text-xs text-gray-500">
                        {restaurant.latestOrder.id.substring(0, 8)}...
                      </p>
                    </div>
                    <Badge variant={restaurant.latestOrder.status === 'COMPLETED' ? 'default' : 'secondary'}>
                      {restaurant.latestOrder.status}
                    </Badge>
                  </div>
                  <div className="mt-2">
                    <p className="text-sm text-gray-600">
                      Total: <span className="font-semibold">${restaurant.latestOrder.total_amount?.toFixed(2)}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex space-x-2 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(`/app/restaurants/${restaurant.id}`)}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  View Details
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    // Filter orders by restaurant
                    navigate(`/app/orders?restaurant=${restaurant.id}`)
                  }}
                >
                  View Orders
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredRestaurants.length === 0 && (
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">
            {search ? 'No restaurants found matching your search' : 'No restaurants have purchased from you yet'}
          </p>
        </div>
      )}
    </div>
  )
}
