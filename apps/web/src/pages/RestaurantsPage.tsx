import { useGetRestaurantsQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Users, Mail, Phone, MapPin, FileText } from 'lucide-react'

export function RestaurantsPage() {
  const { data, isLoading, error } = useGetRestaurantsQuery({
    limit: 20,
    offset: 0,
  })

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
        {data?.restaurants.map((restaurant) => (
          <Card key={restaurant.id}>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
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

      {data?.restaurants.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No restaurants found</p>
        </div>
      )}
    </div>
  )
}
