import { useState, useMemo } from 'react'
import { useGetOrdersQuery, useGetRestaurantsQuery, useGetSupplierMeQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { useNavigate } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import { 
  Building2, Mail, Phone, MapPin, FileText, Search, Pin, BarChart3, ShoppingCart, 
  TrendingUp, DollarSign, Grid3x3, List, Filter, Calendar, Award, MessageCircle,
  Users, Store, Clock, Sparkles, ArrowUpDown, Package
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency, formatPrice } from '../utils/format'

export function RestaurantsPage() {
  const { user } = useAppSelector((state) => state.auth)
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortBy, setSortBy] = useState<'name' | 'orders' | 'revenue' | 'recent'>('name')
  const [filterBy, setFilterBy] = useState<'all' | 'active' | 'new'>('all')
  const isSupplier = user?.role === 'SUPPLIER'
  
  // Get supplier info to filter orders
  const { data: supplierData } = useGetSupplierMeQuery(undefined, { skip: !isSupplier })
  const supplierId = supplierData?.supplier?.id
  
  // Get orders to find restaurants (filter by supplier if supplier)
  const { data: ordersData } = useGetOrdersQuery({
    limit: 1000,
    offset: 0,
  }, { skip: !isSupplier })
  
  // Get all restaurants
  const { data: restaurantsData, isLoading, error } = useGetRestaurantsQuery({
    limit: 1000,
    offset: 0,
  })

  // Supplier view: Show restaurants that purchased from this supplier
  const restaurantsWithOrders = useMemo(() => {
    if (!isSupplier || !ordersData?.orders || !restaurantsData?.restaurants || !supplierId) return []
    
    // Filter orders to only include those with items from this supplier
    const supplierOrders = ordersData.orders.filter(order => {
      return order.items?.some((item: any) => item.supplier_id === supplierId)
    })
    
    // Get unique restaurant IDs from supplier orders
    const restaurantIds = new Set(
      supplierOrders
        .filter(order => order.restaurant_id)
        .map(order => order.restaurant_id)
    )
    
    // Get restaurant details and order statistics
    return Array.from(restaurantIds).map(restaurantId => {
      const restaurant = restaurantsData.restaurants.find(r => r.id === restaurantId)
      if (!restaurant) return null
      
      // Filter restaurant orders to only include orders with items from this supplier
      const restaurantOrders = supplierOrders.filter(
        order => order.restaurant_id === restaurantId
      )
      
      const totalOrders = restaurantOrders.length
      const totalSpent = restaurantOrders.reduce((sum, order) => {
        // Only sum items from this supplier
        const supplierItemsTotal = order.items
          ?.filter((item: any) => item.supplier_id === supplierId)
          .reduce((itemSum: number, item: any) => itemSum + (item.line_total || 0), 0) || 0
        return sum + supplierItemsTotal
      }, 0)
      
      const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0
      
      const latestOrder = restaurantOrders.sort((a, b) => 
        new Date(b.placed_at || b.created_at).getTime() - new Date(a.placed_at || a.created_at).getTime()
      )[0]
      
      // Get most purchased products from this supplier
      const productCount = new Map()
      restaurantOrders.forEach(order => {
        order.items
          ?.filter((item: any) => item.supplier_id === supplierId)
          .forEach((item: any) => {
            productCount.set(item.product_id, (productCount.get(item.product_id) || 0) + item.quantity)
          })
      })
      
      const mostPurchasedProduct = Array.from(productCount.entries())
        .sort((a, b) => b[1] - a[1])[0]
      
      return {
        ...restaurant,
        totalOrders,
        totalSpent,
        averageOrderValue,
        latestOrder,
        mostPurchasedProduct,
      }
    }).filter(Boolean)
  }, [ordersData, restaurantsData, supplierId, isSupplier])

  // Filter and sort restaurants
  const filteredAndSortedRestaurants = useMemo(() => {
    let restaurants = restaurantsWithOrders

    // Filter by status
    if (filterBy === 'active') {
      // Active = ordered in last 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      restaurants = restaurants.filter((r: any) => 
        r.latestOrder && new Date(r.latestOrder.placed_at || r.latestOrder.created_at) > thirtyDaysAgo
      )
    } else if (filterBy === 'new') {
      // New = restaurant joined in last 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      restaurants = restaurants.filter((r: any) => new Date(r.created_at) > thirtyDaysAgo)
    }

    // Search filter
    if (search.trim()) {
      const searchLower = search.toLowerCase()
      restaurants = restaurants.filter((r: any) => 
        r.name?.toLowerCase().includes(searchLower) ||
        r.contact_email?.toLowerCase().includes(searchLower) ||
        r.slug?.toLowerCase().includes(searchLower) ||
        r.address_json?.city?.toLowerCase().includes(searchLower) ||
        r.address_json?.country?.toLowerCase().includes(searchLower)
      )
    }

    // City filter
    if (cityFilter.trim()) {
      const cityLower = cityFilter.toLowerCase()
      restaurants = restaurants.filter((r: any) => 
        r.address_json?.city?.toLowerCase().includes(cityLower)
      )
    }

    // Sort
    restaurants = [...restaurants].sort((a: any, b: any) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'orders':
          return (b.totalOrders || 0) - (a.totalOrders || 0)
        case 'revenue':
          return (b.totalSpent || 0) - (a.totalSpent || 0)
        case 'recent': {
          const aDate = a.latestOrder ? new Date(a.latestOrder.placed_at || a.latestOrder.created_at).getTime() : 0
          const bDate = b.latestOrder ? new Date(b.latestOrder.placed_at || b.latestOrder.created_at).getTime() : 0
          return bDate - aDate
        }
        default:
          return 0
      }
    })

    return restaurants
  }, [restaurantsWithOrders, filterBy, search, cityFilter, sortBy])

  // Calculate statistics
  const stats = useMemo(() => {
    const restaurants = restaurantsWithOrders
    const totalRevenue = restaurants.reduce((sum: number, r: any) => {
      const spent = typeof r.totalSpent === 'number' ? r.totalSpent : parseFloat(r.totalSpent || 0)
      return sum + (isNaN(spent) ? 0 : spent)
    }, 0)
    const totalOrders = restaurants.reduce((sum: number, r: any) => {
      const orders = typeof r.totalOrders === 'number' ? r.totalOrders : parseInt(r.totalOrders || 0)
      return sum + (isNaN(orders) ? 0 : orders)
    }, 0)
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
    
    return {
      total: restaurants.length,
      totalOrders,
      totalRevenue,
      avgOrderValue,
    }
  }, [restaurantsWithOrders])

  // If user is not a supplier, show all restaurants
  if (!isSupplier) {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]"></div>
        </div>
      )
    }

    if (error) {
      return (
        <div className="text-center py-12">
          <p className="text-[var(--red)]">Failed to load restaurants</p>
        </div>
      )
    }

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-[21px] font-black text-[var(--text)]">Restaurants</h1>
          <p className="text-[var(--text-muted)] mt-2">
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
                    <Mail className="h-4 w-4 text-[var(--text-muted)]" />
                    <span>{restaurant.contact_email}</span>
                  </div>
                  {restaurant.phone && (
                    <div className="flex items-center space-x-2">
                      <Phone className="h-4 w-4 text-[var(--text-muted)]" />
                      <span>{restaurant.phone}</span>
                    </div>
                  )}
                  {restaurant.address_json && (
                    <div className="flex items-center space-x-2">
                      <MapPin className="h-4 w-4 text-[var(--text-muted)]" />
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
                  <span className="text-xs text-[var(--text-muted)]">
                    Joined {new Date(restaurant.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {restaurantsData?.restaurants.length === 0 && (
          <div className="text-center py-12">
            <Building2 className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-4" />
            <p className="text-[var(--text-muted)]">No restaurants found</p>
          </div>
        )}
      </div>
    )
  }

  if (isLoading || (isSupplier && !supplierId)) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[var(--brand)]"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-[var(--red)]">Failed to load restaurants</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[21px] font-black text-[var(--text)]">My Restaurants</h1>
          <p className="text-[var(--text-muted)] mt-2">
            Restaurants that purchase from you
          </p>
        </div>
        {isSupplier && (
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('grid')}
            >
              <Grid3x3 className="h-4 w-4 mr-1" />
              Grid
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4 mr-1" />
              List
            </Button>
          </div>
        )}
      </div>

      {/* Statistics Cards */}
      {isSupplier && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-muted)]">Total Restaurants</p>
                  <p className="text-2xl font-bold text-[var(--text)]">{stats.total}</p>
                </div>
                <Building2 className="h-8 w-8 text-[var(--brand-mid)]" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-muted)]">Total Orders</p>
                  <p className="text-2xl font-bold text-[var(--text)]">{stats.totalOrders}</p>
                </div>
                <ShoppingCart className="h-8 w-8 text-[var(--mint)]" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-muted)]">Total Revenue</p>
                  <p className="text-2xl font-bold text-[var(--text)]">{formatCurrency(stats.totalRevenue, { maximumFractionDigits: 0 })}</p>
                </div>
                <DollarSign className="h-8 w-8 text-[var(--brand-mid)]" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--text-muted)]">Avg Order Value</p>
                  <p className="text-2xl font-bold text-[var(--text)]">{formatCurrency(stats.avgOrderValue, { maximumFractionDigits: 0 })}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-[var(--amber-mid)]" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
            <Input
              placeholder="Search restaurants by name, email, or city..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="w-64">
            <Input
              placeholder="Filter by city..."
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant={filterBy === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterBy('all')}
          >
            All
          </Button>
          <Button
            variant={filterBy === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterBy('active')}
          >
            <Clock className="h-3 w-3 mr-1" />
            Active
          </Button>
          <Button
            variant={filterBy === 'new' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterBy('new')}
          >
            <Sparkles className="h-3 w-3 mr-1" />
            New
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <ArrowUpDown className="h-4 w-4 text-[var(--text-muted)]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1 text-sm border border-[var(--app-border-mid)] rounded-md bg-white"
            >
              <option value="name">Sort by Name</option>
              <option value="orders">Sort by Orders</option>
              <option value="revenue">Sort by Revenue</option>
              <option value="recent">Sort by Recent</option>
            </select>
          </div>
        </div>
      </div>

      {/* Restaurant Grid/List */}
      {filteredAndSortedRestaurants.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Building2 className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-[var(--text)] mb-2">No restaurants found</h3>
              <p className="text-[var(--text-muted)] mb-4">
                {search || cityFilter || filterBy !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'No restaurants have purchased from you yet'}
              </p>
              {(search || cityFilter || filterBy !== 'all') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearch('')
                    setCityFilter('')
                    setFilterBy('all')
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredAndSortedRestaurants.map((restaurant: any) => (
            <Card key={restaurant.id} className="hover:shadow-lg transition-all duration-200 relative group">
              {/* Active/New Badge */}
              {(() => {
                const thirtyDaysAgo = new Date()
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
                const isActive = restaurant.latestOrder && new Date(restaurant.latestOrder.placed_at || restaurant.latestOrder.created_at) > thirtyDaysAgo
                const isNew = new Date(restaurant.created_at) > thirtyDaysAgo
                
                if (isActive || isNew) {
                  return (
                    <div className="absolute top-3 right-3 z-10">
                      {isActive && (
                        <Badge className="bg-[var(--mint)] text-white">
                          <Clock className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      )}
                      {isNew && (
                        <Badge className="bg-[var(--brand)] text-white ml-1">
                          <Sparkles className="h-3 w-3 mr-1" />
                          New
                        </Badge>
                      )}
                    </div>
                  )
                }
                return null
              })()}

              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  {restaurant.logo_url ? (
                    <img 
                      src={restaurant.logo_url} 
                      alt={restaurant.name} 
                      className="h-12 w-12 rounded-lg object-cover border-2 border-[var(--app-border)] shadow-md"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        const fallback = target.nextElementSibling as HTMLDivElement
                        if (fallback) fallback.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  <div className={`h-12 w-12 rounded-lg bg-gradient-to-br from-[var(--amber-mid)] to-[var(--red)] flex items-center justify-center text-white font-bold text-lg shadow-md ${restaurant.logo_url ? 'hidden' : ''}`}>
                    {restaurant.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{restaurant.name}</CardTitle>
                    <CardDescription className="truncate">{restaurant.slug}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Contact Info */}
                <div className="space-y-2 text-sm">
                  {restaurant.contact_email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                      <a href={`mailto:${restaurant.contact_email}`} className="text-[var(--brand-mid)] hover:underline truncate">
                        {restaurant.contact_email}
                      </a>
                    </div>
                  )}
                  {restaurant.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                      <a href={`tel:${restaurant.phone}`} className="text-[var(--text-mid)] hover:text-[var(--brand-mid)]">
                        {restaurant.phone}
                      </a>
                    </div>
                  )}
                  {restaurant.address_json && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                      <span className="text-[var(--text-mid)]">
                        {restaurant.address_json.city}, {restaurant.address_json.country}
                      </span>
                    </div>
                  )}
                </div>

                {/* Statistics */}
                <div className="grid grid-cols-3 gap-3 pt-3 border-t">
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-[var(--text-muted)]">
                      <ShoppingCart className="h-4 w-4" />
                      <p className="text-xl font-bold">{restaurant.totalOrders || 0}</p>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Orders</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-[var(--text-muted)]">
                      <DollarSign className="h-4 w-4" />
                      <p className="text-xl font-bold">{formatCurrency(restaurant.totalSpent, { maximumFractionDigits: 0 })}</p>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Revenue</p>
                  </div>
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-1 text-[var(--text-muted)]">
                      <TrendingUp className="h-4 w-4" />
                      <p className="text-lg font-semibold">
                        {restaurant.latestOrder 
                          ? new Date(restaurant.latestOrder.placed_at || restaurant.latestOrder.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : 'N/A'}
                      </p>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] mt-1">Last Order</p>
                  </div>
                </div>

                {/* Latest Order Info */}
                {restaurant.latestOrder && (
                  <div className="pt-3 border-t">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-[var(--text-muted)]">Latest Order</span>
                      <Badge variant={restaurant.latestOrder.status === 'COMPLETED' ? 'default' : 'secondary'} className="text-xs">
                        {restaurant.latestOrder.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[var(--text-muted)]">Order #{restaurant.latestOrder.id.substring(0, 8)}</span>
                      <span className="font-semibold text-[var(--text)]">
                        {formatPrice(restaurant.latestOrder.total_amount)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-3 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate(`/app/orders?restaurant=${restaurant.id}`)}
                  >
                    <ShoppingCart className="h-4 w-4 mr-1" />
                    View Orders
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    onClick={() => navigate(`/app/restaurants/${restaurant.id}`)}
                  >
                    <BarChart3 className="h-4 w-4 mr-1" />
                    Details
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAndSortedRestaurants.map((restaurant: any) => (
            <Card key={restaurant.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center gap-4 flex-1">
                  {restaurant.logo_url ? (
                    <img 
                      src={restaurant.logo_url} 
                      alt={restaurant.name} 
                      className="h-16 w-16 rounded-lg object-cover border-2 border-[var(--app-border)] shadow-md"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        const fallback = target.nextElementSibling as HTMLDivElement
                        if (fallback) fallback.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  <div className={`h-16 w-16 rounded-lg bg-gradient-to-br from-[var(--amber-mid)] to-[var(--red)] flex items-center justify-center text-white font-bold text-xl shadow-md ${restaurant.logo_url ? 'hidden' : ''}`}>
                    {restaurant.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-lg font-bold text-[var(--text)]">{restaurant.name}</h3>
                      {(() => {
                        const thirtyDaysAgo = new Date()
                        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
                        const isActive = restaurant.latestOrder && new Date(restaurant.latestOrder.placed_at || restaurant.latestOrder.created_at) > thirtyDaysAgo
                        const isNew = new Date(restaurant.created_at) > thirtyDaysAgo
                        
                        return (
                          <>
                            {isActive && (
                              <Badge className="bg-[var(--mint)] text-white">
                                <Clock className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            )}
                            {isNew && (
                              <Badge className="bg-[var(--brand)] text-white">
                                <Sparkles className="h-3 w-3 mr-1" />
                                New
                              </Badge>
                            )}
                          </>
                        )
                      })()}
                    </div>
                    <p className="text-sm text-[var(--text-muted)]">{restaurant.slug}</p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-center">
                      <p className="text-xl font-bold text-[var(--text)]">{restaurant.totalOrders || 0}</p>
                      <p className="text-xs text-[var(--text-muted)]">Orders</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xl font-bold text-[var(--text)]">{formatCurrency(restaurant.totalSpent, { maximumFractionDigits: 0 })}</p>
                      <p className="text-xs text-[var(--text-muted)]">Revenue</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-semibold text-[var(--text)]">
                        {restaurant.latestOrder 
                          ? new Date(restaurant.latestOrder.placed_at || restaurant.latestOrder.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : 'N/A'}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">Last Order</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/app/orders?restaurant=${restaurant.id}`)}
                    >
                      <ShoppingCart className="h-4 w-4 mr-1" />
                      Orders
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => navigate(`/app/restaurants/${restaurant.id}`)}
                    >
                      <BarChart3 className="h-4 w-4 mr-1" />
                      Details
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
