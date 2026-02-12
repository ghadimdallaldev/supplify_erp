import { useState, useMemo } from 'react'
import { useGetSuppliersQuery, useFollowSupplierMutation, useUnfollowSupplierMutation } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { 
  Building2, Mail, Phone, MapPin, Search, Star, Package, Heart, Ban, Eye, 
  Grid3x3, List, Filter, TrendingUp, ShoppingCart, MessageCircle, Calendar,
  Award, CheckCircle, ArrowUpDown, Sparkles, Users, Store, Clock
} from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import { Link, useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'

export function SuppliersPage() {
  const { user } = useAppSelector((state) => state.auth)
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'products' | 'recent' | 'followed'>('name')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [filterBy, setFilterBy] = useState<'all' | 'followed' | 'new'>('all')
  
  const isRestaurant = user?.role === 'RESTAURANT'
  
  const { data, isLoading, error, refetch } = useGetSuppliersQuery({
    q: search || undefined,
    city: cityFilter || undefined,
    limit: 50,
    offset: 0,
  })
  
  const [followSupplier] = useFollowSupplierMutation()
  const [unfollowSupplier] = useUnfollowSupplierMutation()

  // Calculate statistics
  const stats = useMemo(() => {
    const suppliers = data?.suppliers || []
    return {
      total: suppliers.length,
      followed: suppliers.filter((s: any) => s.is_followed).length,
      withProducts: suppliers.filter((s: any) => Number(s.product_count || 0) > 0).length,
      totalProducts: suppliers.reduce((sum: number, s: any) => sum + Number(s.product_count || 0), 0)
    }
  }, [data?.suppliers])

  // Filter and sort suppliers
  const filteredSuppliers = useMemo(() => {
    let suppliers = data?.suppliers || []
    
    // Filter by status
    if (filterBy === 'followed') {
      suppliers = suppliers.filter((s: any) => s.is_followed)
    } else if (filterBy === 'new') {
      // Show recently created suppliers (within last 30 days)
      suppliers = suppliers.filter((s: any) => {
        const created = new Date(s.created_at)
        const daysSince = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)
        return daysSince <= 30
      })
    }
    
    // Sort
    suppliers = [...suppliers].sort((a: any, b: any) => {
      switch (sortBy) {
        case 'products':
          return Number(b.product_count || 0) - Number(a.product_count || 0)
        case 'recent':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        case 'followed':
          if (a.is_followed && !b.is_followed) return -1
          if (!a.is_followed && b.is_followed) return 1
          return 0
        case 'name':
        default:
          return a.name.localeCompare(b.name)
      }
    })
    
    return suppliers
  }, [data?.suppliers, filterBy, sortBy])

  const handleFollow = async (supplierId: string) => {
    try {
      await followSupplier(supplierId).unwrap()
      toast.success('Supplier followed')
      // RTK Query will automatically refetch due to invalidatesTags, but manual refetch ensures immediate UI update
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to follow supplier')
    }
  }

  const handleUnfollow = async (supplierId: string) => {
    try {
      await unfollowSupplier(supplierId).unwrap()
      toast.success('Supplier unfollowed')
      // RTK Query will automatically refetch due to invalidatesTags, but manual refetch ensures immediate UI update
      refetch()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to unfollow supplier')
    }
  }

  const handleViewProducts = (supplierId: string) => {
    navigate(`/app/products?supplier=${supplierId}`)
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
        <p className="text-red-600">Failed to load suppliers</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-gray-600 mt-2">
            {isRestaurant ? 'Discover and connect with trusted suppliers' : 'Manage suppliers in the marketplace'}
          </p>
        </div>
        {isRestaurant && (
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
      {isRestaurant && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Suppliers</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
                </div>
                <Building2 className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Following</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.followed}</p>
                </div>
                <Heart className="h-8 w-8 text-red-500 fill-current" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">With Products</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.withProducts}</p>
                </div>
                <Package className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Products</p>
                  <p className="text-2xl font-bold text-gray-900">{stats.totalProducts}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Search and Filters */}
      {isRestaurant && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search suppliers by name, email, or city..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Input
                placeholder="Filter by city..."
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="w-48"
              />
              <div className="flex gap-2">
                <Button
                  variant={filterBy === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterBy('all')}
                >
                  <Filter className="h-4 w-4 mr-1" />
                  All
                </Button>
                <Button
                  variant={filterBy === 'followed' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterBy('followed')}
                >
                  <Heart className="h-4 w-4 mr-1" />
                  Following
                </Button>
                <Button
                  variant={filterBy === 'new' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFilterBy('new')}
                >
                  <Sparkles className="h-4 w-4 mr-1" />
                  New
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortBy(sortBy === 'name' ? 'products' : sortBy === 'products' ? 'recent' : 'name')}
                >
                  <ArrowUpDown className="h-4 w-4 mr-1" />
                  {sortBy === 'name' ? 'Name' : sortBy === 'products' ? 'Products' : 'Recent'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Supplier Grid/List */}
      {filteredSuppliers.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center">
              <Building2 className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No suppliers found</h3>
              <p className="text-gray-600 mb-6">
                {search || cityFilter || filterBy !== 'all' 
                  ? 'Try adjusting your search or filter criteria' 
                  : 'No suppliers available in the marketplace'}
              </p>
              {(search || cityFilter || filterBy !== 'all') && (
                <Button variant="outline" onClick={() => {
                  setSearch('')
                  setCityFilter('')
                  setFilterBy('all')
                }}>
                  Clear Filters
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredSuppliers.map((supplier: any) => (
            <Card key={supplier.id} className="hover:shadow-lg transition-all duration-200 relative group">
              {/* Follow Badge */}
              {isRestaurant && supplier.is_followed && (
                <div className="absolute top-4 right-4 z-10">
                  <Badge className="bg-blue-500 text-white flex items-center gap-1 shadow-md">
                    <Heart className="h-3 w-3 fill-current" />
                    Following
                  </Badge>
                </div>
              )}

              {/* New Badge */}
              {(() => {
                const created = new Date(supplier.created_at)
                const daysSince = (Date.now() - created.getTime()) / (1000 * 60 * 60 * 24)
                if (daysSince <= 30) {
                  return (
                    <div className="absolute top-4 left-4 z-10">
                      <Badge className="bg-green-500 text-white flex items-center gap-1 shadow-md">
                        <Sparkles className="h-3 w-3" />
                        New
                      </Badge>
                    </div>
                  )
                }
                return null
              })()}

              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  {supplier.logo_url ? (
                    <img 
                      src={supplier.logo_url} 
                      alt={supplier.name} 
                      className="h-12 w-12 rounded-lg object-cover border-2 border-gray-200 shadow-md"
                      onError={(e) => {
                        // Fallback to gradient if image fails to load
                        const target = e.target as HTMLImageElement
                        target.style.display = 'none'
                        const fallback = target.nextElementSibling as HTMLDivElement
                        if (fallback) fallback.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  <div className={`h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-md ${supplier.logo_url ? 'hidden' : ''}`}>
                    {supplier.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{supplier.name}</CardTitle>
                    <CardDescription className="truncate">{supplier.slug}</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Key Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                    <div className="flex items-center gap-2 mb-1">
                      <Package className="h-4 w-4 text-blue-600" />
                      <span className="text-xs font-medium text-blue-700">Products</span>
                    </div>
                    <p className="text-xl font-bold text-blue-900">{Number(supplier.product_count || 0)}</p>
                  </div>
                  {supplier.avg_price > 0 && (
                    <div className="bg-green-50 rounded-lg p-3 border border-green-100">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="h-4 w-4 text-green-600" />
                        <span className="text-xs font-medium text-green-700">Avg Price</span>
                      </div>
                      <p className="text-xl font-bold text-green-900">
                        ${parseFloat(supplier.avg_price).toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>

                {/* Location */}
                {supplier.address_json && (
                  <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-md p-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span className="truncate">
                      {supplier.address_json.city}, {supplier.address_json.country}
                    </span>
                  </div>
                )}

                {/* Contact Quick Access */}
                <div className="flex items-center gap-2 text-sm">
                  {supplier.contact_email && (
                    <a 
                      href={`mailto:${supplier.contact_email}`}
                      className="flex items-center gap-1 text-blue-600 hover:text-blue-700 hover:underline"
                    >
                      <Mail className="h-3 w-3" />
                      <span className="truncate text-xs">{supplier.contact_email}</span>
                    </a>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t flex-wrap">
                  {isRestaurant && (
                    <Button 
                      variant="default" 
                      size="sm" 
                      className="flex-1 min-w-0"
                      asChild
                    >
                      <Link to={`/app/chat?supplier=${supplier.id}`}>
                        <MessageCircle className="h-4 w-4 mr-1 shrink-0" />
                        Message
                      </Link>
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 min-w-0"
                    onClick={() => handleViewProducts(supplier.id)}
                  >
                    <Package className="h-4 w-4 mr-1 shrink-0" />
                    Products
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    asChild
                  >
                    <Link to={`/app/suppliers/${supplier.id}`}>
                      <Eye className="h-4 w-4 mr-1 shrink-0" />
                      View
                    </Link>
                  </Button>
                  {isRestaurant && (
                    <>
                      {!supplier.is_followed ? (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleFollow(supplier.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Heart className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleUnfollow(supplier.id)}
                          className="text-red-600 bg-red-50 hover:bg-red-100"
                        >
                          <Heart className="h-4 w-4 fill-current" />
                        </Button>
                      )}
                    </>
                  )}
                </div>

                {/* Additional Info */}
                <div className="flex items-center justify-between text-xs text-gray-500 pt-2 border-t">
                  {supplier.vat_no && (
                    <span>VAT: {supplier.vat_no}</span>
                  )}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {new Date(supplier.created_at).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSuppliers.map((supplier: any) => (
            <Card key={supplier.id} className="hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    {supplier.logo_url ? (
                      <img 
                        src={supplier.logo_url} 
                        alt={supplier.name} 
                        className="h-16 w-16 rounded-lg object-cover border-2 border-gray-200 shadow-md"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.style.display = 'none'
                          const fallback = target.nextElementSibling as HTMLDivElement
                          if (fallback) fallback.style.display = 'flex'
                        }}
                      />
                    ) : null}
                    <div className={`h-16 w-16 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl shadow-md ${supplier.logo_url ? 'hidden' : ''}`}>
                      {supplier.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-lg font-bold text-gray-900">{supplier.name}</h3>
                        {isRestaurant && supplier.is_followed && (
                          <Badge className="bg-blue-500 text-white">
                            <Heart className="h-3 w-3 mr-1 fill-current" />
                            Following
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Package className="h-4 w-4" />
                          {Number(supplier.product_count || 0)} Products
                        </span>
                        {supplier.avg_price > 0 && (
                          <span className="flex items-center gap-1">
                            <TrendingUp className="h-4 w-4" />
                            Avg: ${parseFloat(supplier.avg_price).toFixed(2)}
                          </span>
                        )}
                        {supplier.address_json && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-4 w-4" />
                            {supplier.address_json.city}, {supplier.address_json.country}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {isRestaurant && (
                      <Button 
                        variant="default" 
                        size="sm"
                        asChild
                      >
                        <Link to={`/app/chat?supplier=${supplier.id}`}>
                          <MessageCircle className="h-4 w-4 mr-1" />
                          Message
                        </Link>
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleViewProducts(supplier.id)}
                    >
                      <Package className="h-4 w-4 mr-1" />
                      View Products
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      asChild
                    >
                      <Link to={`/app/suppliers/${supplier.id}`}>
                        <Eye className="h-4 w-4 mr-1" />
                        Details
                      </Link>
                    </Button>
                    {isRestaurant && (
                      <>
                        {!supplier.is_followed ? (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleFollow(supplier.id)}
                          >
                            <Heart className="h-4 w-4 mr-1" />
                            Follow
                          </Button>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleUnfollow(supplier.id)}
                            className="text-red-600"
                          >
                            <Heart className="h-4 w-4 mr-1 fill-current" />
                            Unfollow
                          </Button>
                        )}
                      </>
                    )}
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
