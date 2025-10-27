import { useParams } from 'react-router-dom'
import { useGetSupplierQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Building2, Mail, Phone, MapPin, Package, MessageSquare, Heart } from 'lucide-react'
import { useAppSelector } from '../hooks/redux'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'

export function SupplierDetailPage() {
  const { id } = useParams()
  const { user } = useAppSelector((state) => state.auth)
  const isRestaurant = user?.role === 'RESTAURANT'
  
  const { data, isLoading, error } = useGetSupplierQuery(id!)

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
              <Button variant="outline">
                <Heart className="h-4 w-4 mr-2" />
                Follow
              </Button>
              <Button variant="outline">
                <MessageSquare className="h-4 w-4 mr-2" />
                Message
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
              View Products
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
    </div>
  )
}

