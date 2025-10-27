import { useParams, useNavigate } from 'react-router-dom'
import { useGetSupplierQuery, useGetProductsQuery, useCreateConversationMutation, useGetRestaurantsQuery, useFollowSupplierMutation, useUnfollowSupplierMutation } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Building2, Mail, Phone, MapPin, Package, MessageSquare, Heart } from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

export function SupplierDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const isRestaurant = user?.role === 'RESTAURANT'
  
  const { data, isLoading, error } = useGetSupplierQuery(id!)
  const { data: restaurantsData } = useGetRestaurantsQuery()
  const [createConversation, { isLoading: isCreatingConversation }] = useCreateConversationMutation()
  const [followSupplier, { isLoading: isFollowing }] = useFollowSupplierMutation()
  const [unfollowSupplier, { isLoading: isUnfollowing }] = useUnfollowSupplierMutation()
  
  // Fetch products for this supplier
  const { data: productsData, isLoading: isLoadingProducts } = useGetProductsQuery({
    supplier: id,
    limit: 50,
    offset: 0,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (error || !data?.supplier) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600">Failed to load supplier</p>
      </div>
    )
  }

  const supplier = data.supplier

  const handleSendMessage = async () => {
    if (!user || !id) {
      toast.error('User or supplier ID missing')
      return
    }
    
    try {
      // Create or get conversation
      // The backend will automatically get the restaurant ID based on the logged-in user's email
      const result = await createConversation({
        supplierId: id,
      }).unwrap()
      
      toast.success('Opening conversation...')
      navigate(`/app/chat?conversation=${result.conversation.id}`)
    } catch (error: any) {
      console.error('Create conversation error:', error)
      toast.error(error?.data?.error?.message || 'Failed to start conversation')
    }
  }

  const handleFollowToggle = async () => {
    if (!id) return
    
    const isFollowed = supplier.is_followed
    
    try {
      if (isFollowed) {
        await unfollowSupplier(id).unwrap()
        toast.success('Supplier unfollowed')
      } else {
        await followSupplier(id).unwrap()
        toast.success('Supplier followed')
      }
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update follow status')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">{supplier.name}</h1>
          <p className="text-gray-600 mt-2">{supplier.slug}</p>
        </div>
        <div className="flex space-x-2">
          {isRestaurant && (
            <>
              <Button 
                variant={supplier.is_followed ? "default" : "outline"}
                onClick={handleFollowToggle}
                disabled={isFollowing || isUnfollowing}
              >
                <Heart className={`h-4 w-4 mr-2 ${supplier.is_followed ? 'fill-current' : ''}`} />
                {supplier.is_followed ? 'Following' : 'Follow'}
              </Button>
              <Button 
                variant="outline"
                onClick={handleSendMessage}
                disabled={isCreatingConversation}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                {isCreatingConversation ? 'Opening...' : 'Message'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-2">
              <Mail className="h-4 w-4 text-gray-400" />
              <span>{supplier.contact_email}</span>
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
                <span>
                  {supplier.address_json.city}, {supplier.address_json.country}
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Products */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Package className="h-5 w-5" />
              <span>Products</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{supplier.product_count || 0}</p>
            <p className="text-sm text-gray-600">Total products available</p>
            {supplier.avg_price > 0 && (
              <p className="text-sm text-gray-600 mt-2">
                Average price: ${parseFloat(supplier.avg_price).toFixed(2)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Additional Info */}
        <Card>
          <CardHeader>
            <CardTitle>Additional Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {supplier.vat_no && (
              <div>
                <p className="text-sm text-gray-600">VAT Number</p>
                <p className="font-medium">{supplier.vat_no}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-gray-600">Member Since</p>
              <p className="font-medium">
                {new Date(supplier.created_at).toLocaleDateString()}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      {isRestaurant && (
        <div className="flex space-x-4">
          <Button asChild>
            <Link to={`/app/products?supplier=${supplier.id}`}>
              <Package className="h-4 w-4 mr-2" />
              View All Products
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to={`/app/chat?supplier=${supplier.id}`}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Send Message
            </Link>
          </Button>
        </div>
      )}

      {/* Products List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Package className="h-5 w-5" />
            <span>Products ({productsData?.products.length || 0})</span>
          </CardTitle>
          <CardDescription>
            Browse products from this supplier
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingProducts ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : productsData?.products.length === 0 ? (
            <div className="text-center py-12">
              <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No products available from this supplier</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {productsData?.products.slice(0, 6).map((product: any) => (
                <div key={product.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium">{product.name}</h4>
                    {product.category && (
                      <Badge variant="secondary">{product.category}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{product.sku}</p>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">
                      ${product.current_price ? parseFloat(product.current_price).toFixed(2) : 'N/A'}
                    </p>
                    <p className="text-sm text-gray-600">
                      Stock: {product.available_qty || 0}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="w-full mt-3" asChild>
                    <Link to={`/app/products/${product.id}`}>
                      View Details
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

