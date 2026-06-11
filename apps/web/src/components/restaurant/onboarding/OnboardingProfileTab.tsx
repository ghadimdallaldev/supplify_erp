import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Textarea } from '../../ui/textarea'
import { Select, SelectTrigger } from '../../ui/select'
import { Mail, Phone, Globe, Save, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { TenantBrandingPanel } from '../../settings/TenantBrandingPanel'
import {
  useGetRestaurantMeQuery,
  useUpdateRestaurantMutation,
  useUploadRestaurantLogoMutation,
  useGetPresignedUrlMutation,
  useGetEntitlementsQuery,
} from '../../../services/api'
import { RestaurantDeliveryLocationCard } from '../RestaurantDeliveryLocationCard'
import { usePermissions } from '../../../hooks/usePermissions'
import { normalizeAddress } from '../../../lib/address'
import { OnboardingTabLoading } from './onboardingShared'

export function OnboardingProfileTab() {
  const { can } = usePermissions()
  const {
    data: restaurantData,
    isLoading: isLoadingRestaurant,
    refetch: refetchRestaurant,
  } = useGetRestaurantMeQuery()
  const [updateRestaurant, { isLoading: isUpdating }] = useUpdateRestaurantMutation()
  const [uploadRestaurantLogo] = useUploadRestaurantLogoMutation()
  const [getPresignedUrl] = useGetPresignedUrlMutation()
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const entitlements = entitlementsData?.entitlements
  const restaurant = restaurantData?.restaurant

  const [profileForm, setProfileForm] = useState({
    name: '',
    business_type: '',
    trade_license_no: '',
    tax_id: '',
    vat_number: '',
    phone: '',
    contact_email: '',
    address: { street: '', city: '', region: '', country: '' },
    delivery_instructions: '',
    description: '',
    website: '',
  })

  useEffect(() => {
    if (restaurant) {
      setProfileForm({
        name: restaurant.name || '',
        business_type: restaurant.business_type || 'restaurant',
        trade_license_no: restaurant.trade_license_no || '',
        tax_id: restaurant.tax_id || '',
        vat_number: restaurant.vat_number || '',
        phone: restaurant.phone || '',
        contact_email: restaurant.contact_email || '',
        address: normalizeAddress(restaurant.address_json),
        delivery_instructions: restaurant.delivery_instructions || '',
        description: restaurant.description || '',
        website: restaurant.website || '',
      })
    }
  }, [restaurant])

  const handleLogoUpload = async (logoUrl: string) => {
    if (!restaurant?.id) {
      toast.error('Restaurant information not loaded')
      throw new Error('Restaurant information not loaded')
    }
    try {
      await uploadRestaurantLogo({ id: restaurant.id, logoUrl }).unwrap()
      refetchRestaurant()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to upload logo')
      throw error
    }
  }

  const handleGetPresignedUrl = async (params: {
    fileName: string
    fileType: string
    fileSize?: number
  }) => getPresignedUrl(params).unwrap()

  const handleSaveProfile = async () => {
    if (!restaurant?.id) {
      toast.error('Restaurant information not loaded')
      return
    }

    try {
      await updateRestaurant({
        id: restaurant.id,
        data: {
          name: profileForm.name,
          tradeLicenseNo: profileForm.trade_license_no,
          phone: profileForm.phone,
          contactEmail: profileForm.contact_email,
          address: profileForm.address,
        },
      }).unwrap()
      toast.success('Profile updated successfully!')
      refetchRestaurant()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update profile')
    }
  }

  if (isLoadingRestaurant) {
    return <OnboardingTabLoading />
  }

  return (
    <div className="space-y-4">
      <TenantBrandingPanel
        tenantType="RESTAURANT"
        entityId={restaurant?.id}
        entityName={restaurant?.name || 'Restaurant'}
        currentLogo={restaurant?.logo_url}
        entitlements={entitlements}
        canEditBranding={can('SETTINGS_EDIT') || can('SETTINGS_MANAGE')}
        upgradeTab="subscription"
        logoTitle="Business Logo"
        logoDescription="Upload your business logo. This will be displayed in your profile and to suppliers."
        onLogoUpload={handleLogoUpload}
        getPresignedUrl={handleGetPresignedUrl}
      />

      <Card>
        <CardHeader>
          <CardTitle>Business Profile</CardTitle>
          <CardDescription>Update your business information and contact details</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">Business Name *</Label>
              <Input
                id="businessName"
                placeholder="Enter business name"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessType">Business Type *</Label>
              <Select
                value={profileForm.business_type}
                onValueChange={(value) => setProfileForm({ ...profileForm, business_type: value })}
              >
                <SelectTrigger id="businessType">
                  <option value="restaurant">Restaurant</option>
                  <option value="cafe">Café</option>
                  <option value="hotel">Hotel</option>
                  <option value="catering">Catering</option>
                </SelectTrigger>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="registrationNumber">Registration Number</Label>
              <Input
                id="registrationNumber"
                placeholder="Enter registration number"
                value={profileForm.trade_license_no}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, trade_license_no: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">Tax ID</Label>
              <Input
                id="taxId"
                placeholder="Enter tax ID"
                value={profileForm.tax_id}
                onChange={(e) => setProfileForm({ ...profileForm, tax_id: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vatNumber">VAT Number</Label>
            <Input
              id="vatNumber"
              placeholder="Enter VAT number"
              value={profileForm.vat_number}
              onChange={(e) => setProfileForm({ ...profileForm, vat_number: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact-email">Contact Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  id="contact-email"
                  type="email"
                  placeholder="contact@restaurant.com"
                  value={profileForm.contact_email}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, contact_email: e.target.value })
                  }
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-phone">Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  id="contact-phone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
              <Input
                id="website"
                type="url"
                placeholder="https://www.restaurant.com"
                value={profileForm.website}
                onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Business Description</Label>
            <Textarea
              id="description"
              placeholder="Tell suppliers about your restaurant..."
              rows={4}
              value={profileForm.description}
              onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="street">Street Address</Label>
              <Input
                id="street"
                placeholder="123 Main Street"
                value={profileForm.address.street}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    address: { ...profileForm.address, street: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="City Name"
                value={profileForm.address.city}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    address: { ...profileForm.address, city: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region/State</Label>
              <Input
                id="region"
                placeholder="State or Region"
                value={profileForm.address.region}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    address: { ...profileForm.address, region: e.target.value },
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                placeholder="Country"
                value={profileForm.address.country}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    address: { ...profileForm.address, country: e.target.value },
                  })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="deliveryInstructions">Delivery Instructions</Label>
            <Textarea
              id="deliveryInstructions"
              placeholder="e.g., Gate A, Floor 2, Landmark: next to gas station"
              rows={3}
              value={profileForm.delivery_instructions}
              onChange={(e) =>
                setProfileForm({ ...profileForm, delivery_instructions: e.target.value })
              }
            />
          </div>

          <Button onClick={handleSaveProfile} disabled={isUpdating}>
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <RestaurantDeliveryLocationCard />
    </div>
  )
}
