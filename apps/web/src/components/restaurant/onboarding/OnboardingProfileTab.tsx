import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Textarea } from '../../ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger } from '../../ui/select'
import { Mail, Phone, Globe, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { OnboardingTabLoading, SettingsSection } from './onboardingShared'

export function OnboardingProfileTab() {
  const { t } = useTranslation('onboarding')
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
      toast.error(t('restaurantProfile.toasts.notLoaded'))
      throw new Error(t('restaurantProfile.toasts.notLoaded'))
    }
    try {
      await uploadRestaurantLogo({ id: restaurant.id, logoUrl }).unwrap()
      refetchRestaurant()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('restaurantProfile.toasts.logoFailed'))
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
      toast.error(t('restaurantProfile.toasts.notLoaded'))
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
      toast.success(t('restaurantProfile.toasts.updated'))
      refetchRestaurant()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('restaurantProfile.toasts.updateFailed'))
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
        entityName={restaurant?.name || t('restaurantProfile.fallbackName')}
        currentLogo={restaurant?.logo_url}
        entitlements={entitlements}
        canEditBranding={can('SETTINGS_EDIT') || can('SETTINGS_MANAGE')}
        upgradeTab="subscription"
        logoTitle={t('restaurantProfile.logo.title')}
        logoDescription={t('restaurantProfile.logo.description')}
        onLogoUpload={handleLogoUpload}
        getPresignedUrl={handleGetPresignedUrl}
      />

      <SettingsSection
        title={t('restaurantProfile.title')}
        description={t('restaurantProfile.description')}
        footer={
          <Button onClick={handleSaveProfile} disabled={isUpdating}>
            {isUpdating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('restaurantProfile.actions.saving')}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {t('restaurantProfile.actions.saveChanges')}
              </>
            )}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">{t('restaurantProfile.fields.businessName')} *</Label>
              <Input
                id="businessName"
                placeholder={t('restaurantProfile.placeholders.businessName')}
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessType">{t('restaurantProfile.fields.businessType')} *</Label>
              <Select
                value={profileForm.business_type}
                onValueChange={(value) => setProfileForm({ ...profileForm, business_type: value })}
              >
                <SelectTrigger id="businessType" />
                <SelectContent>
                  <SelectItem value="restaurant">
                    {t('restaurantProfile.businessTypes.restaurant')}
                  </SelectItem>
                  <SelectItem value="cafe">{t('restaurantProfile.businessTypes.cafe')}</SelectItem>
                  <SelectItem value="hotel">
                    {t('restaurantProfile.businessTypes.hotel')}
                  </SelectItem>
                  <SelectItem value="catering">
                    {t('restaurantProfile.businessTypes.catering')}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="registrationNumber">
                {t('restaurantProfile.fields.registrationNumber')}
              </Label>
              <Input
                id="registrationNumber"
                placeholder={t('restaurantProfile.placeholders.registrationNumber')}
                value={profileForm.trade_license_no}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, trade_license_no: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">{t('restaurantProfile.fields.taxId')}</Label>
              <Input
                id="taxId"
                placeholder={t('restaurantProfile.placeholders.taxId')}
                value={profileForm.tax_id}
                onChange={(e) => setProfileForm({ ...profileForm, tax_id: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vatNumber">{t('restaurantProfile.fields.vatNumber')}</Label>
            <Input
              id="vatNumber"
              placeholder={t('restaurantProfile.placeholders.vatNumber')}
              value={profileForm.vat_number}
              onChange={(e) => setProfileForm({ ...profileForm, vat_number: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact-email">{t('restaurantProfile.fields.contactEmail')} *</Label>
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
              <Label htmlFor="contact-phone">{t('restaurantProfile.fields.phone')}</Label>
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
            <Label htmlFor="website">{t('restaurantProfile.fields.website')}</Label>
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
            <Label htmlFor="description">{t('restaurantProfile.fields.description')}</Label>
            <Textarea
              id="description"
              placeholder={t('restaurantProfile.placeholders.description')}
              rows={4}
              value={profileForm.description}
              onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="street">{t('restaurantProfile.fields.street')}</Label>
              <Input
                id="street"
                placeholder={t('restaurantProfile.placeholders.street')}
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
              <Label htmlFor="city">{t('restaurantProfile.fields.city')}</Label>
              <Input
                id="city"
                placeholder={t('restaurantProfile.placeholders.city')}
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
              <Label htmlFor="region">{t('restaurantProfile.fields.region')}</Label>
              <Input
                id="region"
                placeholder={t('restaurantProfile.placeholders.region')}
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
              <Label htmlFor="country">{t('restaurantProfile.fields.country')}</Label>
              <Input
                id="country"
                placeholder={t('restaurantProfile.placeholders.country')}
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
            <Label htmlFor="deliveryInstructions">
              {t('restaurantProfile.fields.deliveryInstructions')}
            </Label>
            <Textarea
              id="deliveryInstructions"
              placeholder={t('restaurantProfile.placeholders.deliveryInstructions')}
              rows={3}
              value={profileForm.delivery_instructions}
              onChange={(e) =>
                setProfileForm({ ...profileForm, delivery_instructions: e.target.value })
              }
            />
          </div>
        </div>
      </SettingsSection>

      <RestaurantDeliveryLocationCard />
    </div>
  )
}
