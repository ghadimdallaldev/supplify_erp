import { useState } from 'react'
import { useGetSuppliersQuery, useFollowSupplierMutation, useUnfollowSupplierMutation } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Building2, Mail, Phone, MapPin, Search, Star, Package, Heart, Ban, Eye } from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

export function SuppliersPage() {
  const { user } = useAppSelector((state) => state.auth)
  const [search, setSearch] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  
  const isRestaurant = user?.role === 'RESTAURANT'
  
  const { data, isLoading, error, refetch } = useGetSuppliersQuery({
    q: search || undefined,
    city: cityFilter || undefined,
    limit: 20,
    offset: 0,
  })
  
  const [followSupplier] = useFollowSupplierMutation()
  const [unfollowSupplier] = useUnfollowSupplierMutation()

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Suppliers</h1>
          <p className="text-gray-600 mt-2">
            {isRestaurant ? 'Browse and manage your supplier relationships' : 'Manage suppliers in the marketplace'}
          </p>
        </div>
      </div>

      {/* Search and Filter */}
      {isRestaurant && (
        <div className="flex space-x-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search suppliers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <Input
            placeholder="Filter by city..."
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="w-56"
          />
        </div>
      )}

      {/* Supplier Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data?.suppliers.map((supplier: any) => (
          <Card key={supplier.id} className="relative">
            {/* Follow/Blocked Indicators */}
            {isRestaurant && (
              <div className="absolute top-3 right-3 flex space-x-2">
                {supplier.is_followed && (
                  <Badge variant="default" className="bg-blue-600">
                    <Heart className="h-3 w-3 mr-1" />
                    Following
                  </Badge>
                )}
              </div>
            )}

            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Building2 className="h-5 w-5" />
                <span>{supplier.name}</span>
              </CardTitle>
              <CardDescription>
                {supplier.slug}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Stats */}
              <div className="flex items-center justify-between">
                <div className="text-sm">
                  <p className="text-gray-600">{supplier.product_count || 0} Products</p>
                  {supplier.avg_price > 0 && (
                    <p className="text-gray-600">Avg: ${parseFloat(supplier.avg_price).toFixed(2)}</p>
                  )}
                </div>
              </div>

              {/* Contact Info */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center space-x-2">
                  <Mail className="h-4 w-4 text-gray-400" />
                  <span className="truncate">{supplier.contact_email}</span>
                </div>
                {supplier.phone && (
                  <div className="flex items-center space-x-2">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <span>{supplier.phone}</span>
                  </div>
                )}
                {supplier.address_json && (
                  <div className="flex items-center space-x-2">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span className="truncate">
                      {supplier.address_json.city}, {supplier.address_json.country}
                    </span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t">
                <Badge variant="outline">
                  {supplier.vat_no ? `VAT: ${supplier.vat_no}` : 'No VAT'}
                </Badge>
                
                <div className="flex space-x-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/app/suppliers/${supplier.id}`}>
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Link>
                  </Button>
                  {isRestaurant && (
                    <>
                      {!supplier.is_followed ? (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={async () => {
                            try {
                              await followSupplier(supplier.id).unwrap()
                              toast.success('Supplier followed')
                              refetch()
                            } catch (error: any) {
                              toast.error(error?.data?.error?.message || 'Failed to follow supplier')
                            }
                          }}
                        >
                          <Heart className="h-4 w-4 mr-1" />
                          Follow
                        </Button>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={async () => {
                            try {
                              await unfollowSupplier(supplier.id).unwrap()
                              toast.success('Supplier unfollowed')
                              refetch()
                            } catch (error: any) {
                              toast.error(error?.data?.error?.message || 'Failed to unfollow supplier')
                            }
                          }}
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

      {data?.suppliers.length === 0 && (
        <div className="text-center py-12">
          <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No suppliers found</p>
        </div>
      )}
    </div>
  )
}
