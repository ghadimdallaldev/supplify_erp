import { useGetSuppliersQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Building2, Mail, Phone, MapPin } from 'lucide-react'

export function SuppliersPage() {
  const { data, isLoading, error } = useGetSuppliersQuery({
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
        <p className="text-red-600">Failed to load suppliers</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Suppliers</h1>
        <p className="text-gray-600 mt-2">
          Manage suppliers in the marketplace
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {data?.suppliers.map((supplier) => (
          <Card key={supplier.id}>
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
              <div className="space-y-2 text-sm">
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
              </div>
              
              <div className="flex items-center justify-between">
                <Badge variant="outline">
                  {supplier.vat_no ? `VAT: ${supplier.vat_no}` : 'No VAT'}
                </Badge>
                <span className="text-xs text-gray-500">
                  Joined {new Date(supplier.created_at).toLocaleDateString()}
                </span>
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
