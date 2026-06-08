import { useState, useMemo } from 'react'
import { useGetOrdersQuery, useGetRestaurantsQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { useNavigate } from 'react-router-dom'
import { useAppSelector } from '../hooks/redux'
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  Search,
  Pin,
  BarChart3,
  ShoppingCart,
  TrendingUp,
  DollarSign,
  Grid3x3,
  List,
  Filter,
  Calendar,
  Award,
  MessageCircle,
  Users,
  Store,
  Clock,
  Sparkles,
  ArrowUpDown,
  Package,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatCurrency, formatPrice } from '../utils/format'
import {
  CardActionGrid,
  CardStatusBadges,
  cardActionBtnClass,
  cardShellClass,
  CardAddressBlock,
  CardFooterMeta,
  formatAddressLine,
  pageHeaderRowClass,
} from '../components/ui/card-layout'

export function RestaurantsPage() {
  const { user } = useAppSelector((state) => state.auth)
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortBy, setSortBy] = useState<'name' | 'orders' | 'revenue' | 'recent'>('name')
  const [filterBy, setFilterBy] = useState<'all' | 'active' | 'new'>('all')
  const isSupplier = user?.role === 'SUPPLIER'
  const supplierId =
    user?.workspace?.tenantType === 'SUPPLIER' ? user.workspace.tenantId : undefined

  // Get orders to find restaurants (filter by supplier if supplier)
  const { data: ordersData } = useGetOrdersQuery(
    {
      limit: 1000,
      offset: 0,
    },
    { skip: !isSupplier }
  )

  // Get all restaurants
  const {
    data: restaurantsData,
    isLoading,
    error,
  } = useGetRestaurantsQuery({
    limit: 1000,
    offset: 0,
  })

  // Supplier view: API returns restaurants that ordered from or follow this supplier
  const restaurantsWithOrders = useMemo(() => {
    if (!isSupplier || !restaurantsData?.restaurants || !supplierId) return []

    const supplierOrders = (ordersData?.orders || []).filter((order) =>
      order.items?.some((item: any) => item.supplier_id === supplierId)
    )

    return restaurantsData.restaurants.map((restaurant) => {
      const restaurantOrders = supplierOrders.filter(
        (order) => order.restaurant_id === restaurant.id
      )

      const totalOrders = restaurantOrders.length
      const totalSpent = restaurantOrders.reduce((sum, order) => {
        const supplierItemsTotal =
          order.items
            ?.filter((item: any) => item.supplier_id === supplierId)
            .reduce((itemSum: number, item: any) => itemSum + (item.line_total || 0), 0) || 0
        return sum + supplierItemsTotal
      }, 0)

      const averageOrderValue = totalOrders > 0 ? totalSpent / totalOrders : 0

      const latestOrder = restaurantOrders.sort(
        (a, b) =>
          new Date(b.placed_at || b.created_at).getTime() -
          new Date(a.placed_at || a.created_at).getTime()
      )[0]

      const productCount = new Map()
      restaurantOrders.forEach((order) => {
        order.items
          ?.filter((item: any) => item.supplier_id === supplierId)
          .forEach((item: any) => {
            productCount.set(
              item.product_id,
              (productCount.get(item.product_id) || 0) + item.quantity
            )
          })
      })

      const mostPurchasedProduct = Array.from(productCount.entries()).sort((a, b) => b[1] - a[1])[0]

      return {
        ...restaurant,
        totalOrders,
        totalSpent,
        averageOrderValue,
        latestOrder,
        mostPurchasedProduct,
        isFollowerOnly: totalOrders === 0,
      }
    })
  }, [ordersData, restaurantsData, supplierId, isSupplier])

  // Filter and sort restaurants
  const filteredAndSortedRestaurants = useMemo(() => {
    let restaurants = restaurantsWithOrders

    // Filter by status
    if (filterBy === 'active') {
      // Active = ordered in last 30 days
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      restaurants = restaurants.filter(
        (r: any) =>
          r.latestOrder &&
          new Date(r.latestOrder.placed_at || r.latestOrder.created_at) > thirtyDaysAgo
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
      restaurants = restaurants.filter(
        (r: any) =>
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
          const aDate = a.latestOrder
            ? new Date(a.latestOrder.placed_at || a.latestOrder.created_at).getTime()
            : 0
          const bDate = b.latestOrder
            ? new Date(b.latestOrder.placed_at || b.latestOrder.created_at).getTime()
            : 0
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
      const orders =
        typeof r.totalOrders === 'number' ? r.totalOrders : parseInt(r.totalOrders || 0)
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
          <p className="text-[var(--text-muted)] mt-2">Manage restaurants in the marketplace</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {restaurantsData?.restaurants.map((restaurant) => (
            <Card key={restaurant.id} className={cardShellClass}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-5 w-5 shrink-0" />
                  <span className="truncate">{restaurant.name}</span>
                </CardTitle>
                <CardDescription className="truncate">{restaurant.slug}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2 text-sm min-w-0">
                  {restaurant.contact_email && (
                    <div className="flex items-center gap-2 min-w-0">
                      <Mail className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                      <span className="truncate">{restaurant.contact_email}</span>
                    </div>
                  )}
                  {restaurant.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                      <span>{restaurant.phone}</span>
                    </div>
                  )}
                  <CardAddressBlock address={restaurant.address_json} icon={MapPin} />
                </div>

                <CardFooterMeta
                  left={
                    <Badge variant="outline" className="max-w-full truncate">
                      {restaurant.trade_license_no
                        ? `License: ${restaurant.trade_license_no}`
                        : 'No License'}
                    </Badge>
                  }
                  right={<>Joined {new Date(restaurant.created_at).toLocaleDateString()}</>}
                />
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
      <div className={pageHeaderRowClass}>
        <div className="min-w-0">
          <h1 className="text-[21px] font-black text-[var(--text)]">My Restaurants</h1>
          <p className="text-[var(--text-muted)] mt-2">
            Restaurants that follow you or purchase from you
          </p>
        </div>
        {isSupplier && (
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'outline'}
              size="sm"
              className="whitespace-normal"
              onClick={() => setViewMode('grid')}
            >
              <Grid3x3 className="h-4 w-4 mr-1 shrink-0" />
              Grid
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              className="whitespace-normal"
              onClick={() => setViewMode('list')}
            >
              <List className="h-4 w-4 mr-1 shrink-0" />
              List
            </Button>
          </div>
        )}
      </div>

      {/* Statistics Cards */}
      {isSupplier && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
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
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {formatCurrency(stats.totalRevenue, { maximumFractionDigits: 0 })}
                  </p>
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
                  <p className="text-2xl font-bold text-[var(--text)]">
                    {formatCurrency(stats.avgOrderValue, { maximumFractionDigits: 0 })}
                  </p>
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
              <h3 className="text-lg font-semibold text-[var(--text)] mb-2">
                No restaurants found
              </h3>
              <p className="text-[var(--text-muted)] mb-4">
                {search || cityFilter || filterBy !== 'all'
                  ? 'Try adjusting your search or filters'
                  : 'No restaurants follow you or have purchased from you yet'}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {filteredAndSortedRestaurants.map((restaurant: any) => {
            const locationLine = formatAddressLine(restaurant.address_json)
            const thirtyDaysAgo = new Date()
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
            const isActive =
              restaurant.latestOrder &&
              new Date(restaurant.latestOrder.placed_at || restaurant.latestOrder.created_at) >
                thirtyDaysAgo
            const isNew = new Date(restaurant.created_at) > thirtyDaysAgo
            return (
              <Card
                key={restaurant.id}
                className={`${cardShellClass} hover:shadow-lg transition-all duration-200 group`}
              >
                <CardHeader className="pb-3 space-y-2">
                  <CardStatusBadges>
                    {isActive && (
                      <Badge className="bg-[var(--mint)] text-white flex items-center gap-1">
                        <Clock className="h-3 w-3 shrink-0" />
                        Active
                      </Badge>
                    )}
                    {isNew && (
                      <Badge className="bg-[var(--brand)] text-white flex items-center gap-1">
                        <Sparkles className="h-3 w-3 shrink-0" />
                        New
                      </Badge>
                    )}
                    {restaurant.isFollowerOnly && (
                      <Badge variant="outline" className="flex items-center gap-1">
                        <Users className="h-3 w-3 shrink-0" />
                        Following
                      </Badge>
                    )}
                  </CardStatusBadges>
                  <div className="flex items-start gap-3 min-w-0">
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
                    <div
                      className={`h-12 w-12 rounded-lg bg-gradient-to-br from-[var(--amber-mid)] to-[var(--red)] flex items-center justify-center text-white font-bold text-lg shadow-md ${restaurant.logo_url ? 'hidden' : ''}`}
                    >
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
                        <a
                          href={`mailto:${restaurant.contact_email}`}
                          className="text-[var(--brand-mid)] hover:underline truncate"
                        >
                          {restaurant.contact_email}
                        </a>
                      </div>
                    )}
                    {restaurant.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                        <a
                          href={`tel:${restaurant.phone}`}
                          className="text-[var(--text-mid)] hover:text-[var(--brand-mid)]"
                        >
                          {restaurant.phone}
                        </a>
                      </div>
                    )}
                    {locationLine ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin className="h-4 w-4 text-[var(--text-muted)] flex-shrink-0" />
                        <span className="text-[var(--text-mid)] truncate">{locationLine}</span>
                      </div>
                    ) : null}
                  </div>

                  {/* Statistics */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-3 border-t">
                    <div className="text-center min-w-0">
                      <p className="text-lg sm:text-xl font-bold tabular-nums">
                        {restaurant.totalOrders || 0}
                      </p>
                      <p className="text-[10px] sm:text-xs text-[var(--text-muted)] mt-0.5">
                        Orders
                      </p>
                    </div>
                    <div className="text-center min-w-0">
                      <p className="text-lg sm:text-xl font-bold tabular-nums truncate">
                        {formatCurrency(restaurant.totalSpent, { maximumFractionDigits: 0 })}
                      </p>
                      <p className="text-[10px] sm:text-xs text-[var(--text-muted)] mt-0.5">
                        Revenue
                      </p>
                    </div>
                    <div className="text-center min-w-0">
                      <p className="text-sm sm:text-base font-semibold tabular-nums">
                        {restaurant.latestOrder
                          ? new Date(
                              restaurant.latestOrder.placed_at || restaurant.latestOrder.created_at
                            ).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          : 'N/A'}
                      </p>
                      <p className="text-[10px] sm:text-xs text-[var(--text-muted)] mt-0.5">
                        Last order
                      </p>
                    </div>
                  </div>

                  {/* Latest Order Info */}
                  {restaurant.latestOrder && (
                    <div className="pt-3 border-t">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-[var(--text-muted)]">
                          Latest Order
                        </span>
                        <Badge
                          variant={
                            restaurant.latestOrder.status === 'COMPLETED' ? 'default' : 'secondary'
                          }
                          className="text-xs"
                        >
                          {restaurant.latestOrder.status}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-muted)]">
                          Order #{restaurant.latestOrder.id.substring(0, 8)}
                        </span>
                        <span className="font-semibold text-[var(--text)]">
                          {formatPrice(restaurant.latestOrder.total_amount)}
                        </span>
                      </div>
                    </div>
                  )}

                  <CardActionGrid>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cardActionBtnClass()}
                      onClick={() => navigate(`/app/orders?restaurant=${restaurant.id}`)}
                    >
                      <ShoppingCart className="h-4 w-4 mr-1 shrink-0" />
                      <span className="truncate">Orders</span>
                    </Button>
                    <Button
                      size="sm"
                      className={cardActionBtnClass()}
                      onClick={() => navigate(`/app/restaurants/${restaurant.id}`)}
                    >
                      <BarChart3 className="h-4 w-4 mr-1 shrink-0" />
                      Details
                    </Button>
                  </CardActionGrid>
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredAndSortedRestaurants.map((restaurant: any) => (
            <Card
              key={restaurant.id}
              className={`${cardShellClass} hover:shadow-md transition-shadow`}
            >
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4 flex-1 min-w-0">
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
                    <div
                      className={`h-16 w-16 rounded-lg bg-gradient-to-br from-[var(--amber-mid)] to-[var(--red)] flex items-center justify-center text-white font-bold text-xl shadow-md ${restaurant.logo_url ? 'hidden' : ''}`}
                    >
                      {restaurant.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-[var(--text)]">{restaurant.name}</h3>
                        {(() => {
                          const thirtyDaysAgo = new Date()
                          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
                          const isActive =
                            restaurant.latestOrder &&
                            new Date(
                              restaurant.latestOrder.placed_at || restaurant.latestOrder.created_at
                            ) > thirtyDaysAgo
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
                              {restaurant.isFollowerOnly && (
                                <Badge variant="outline">
                                  <Users className="h-3 w-3 mr-1" />
                                  Following
                                </Badge>
                              )}
                            </>
                          )
                        })()}
                      </div>
                      <p className="text-sm text-[var(--text-muted)]">{restaurant.slug}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                      <div className="text-center min-w-[4rem]">
                        <p className="text-xl font-bold text-[var(--text)]">
                          {restaurant.totalOrders || 0}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">Orders</p>
                      </div>
                      <div className="text-center min-w-[4rem]">
                        <p className="text-xl font-bold text-[var(--text)]">
                          {formatCurrency(restaurant.totalSpent, { maximumFractionDigits: 0 })}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">Revenue</p>
                      </div>
                      <div className="text-center min-w-[4rem]">
                        <p className="text-sm font-semibold text-[var(--text)]">
                          {restaurant.latestOrder
                            ? new Date(
                                restaurant.latestOrder.placed_at ||
                                  restaurant.latestOrder.created_at
                              ).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : 'N/A'}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">Last Order</p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full lg:w-auto">
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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
