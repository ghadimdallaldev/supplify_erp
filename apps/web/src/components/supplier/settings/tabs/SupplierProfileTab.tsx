import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card'
import { Button } from '../../../ui/button'
import { Input } from '../../../ui/input'
import { Label } from '../../../ui/label'
import { Textarea } from '../../../ui/textarea'
import {
  Building2,
  FileText,
  Mail,
  Phone,
  Globe,
  Save,
  Loader2,
  Link2,
  Copy,
  ExternalLink,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { LogoUpload } from '../../../LogoUpload'
import { BrandingSettingsSection } from '../../../settings/BrandingSettingsSection'
import { useAppSelector, useAppDispatch } from '../../../../hooks/redux'
import { usePermissions } from '../../../../hooks/usePermissions'
import { canUseCustomBranding, customBrandingUpgradeMessage } from '../../../../lib/planLimits'
import { openBrowseUpgrade } from '../../../../lib/openBrowseUpgrade'
import { normalizeAddress } from '../../../../lib/address'
import {
  useGetSupplierMeQuery,
  useUpdateSupplierMutation,
  useUploadSupplierLogoMutation,
  useGetPresignedUrlMutation,
  useGetEntitlementsQuery,
} from '../../../../services/api'

export function SupplierProfileTab() {
  const dispatch = useAppDispatch()
  const { user } = useAppSelector((state) => state.auth)
  const { can } = usePermissions()
  const {
    data: supplierData,
    isLoading: isLoadingSupplier,
    refetch: refetchSupplier,
  } = useGetSupplierMeQuery()
  const [updateSupplier, { isLoading: isUpdating }] = useUpdateSupplierMutation()
  const [uploadSupplierLogo] = useUploadSupplierLogoMutation()
  const [getPresignedUrl] = useGetPresignedUrlMutation()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, { skip: !user?.id })
  const entitlements = entitlementsData?.entitlements
  const supplier = supplierData?.supplier
  const brandingAllowed = canUseCustomBranding(entitlements)

  const [profileForm, setProfileForm] = useState({
    name: '',
    legal_name: '',
    vat_no: '',
    trade_license_no: '',
    phone: '',
    contact_email: '',
    address: {
      street: '',
      city: '',
      region: '',
      country: '',
    },
    description: '',
    website: '',
  })

  const catalogLink = useMemo(() => {
    if (!supplier?.id) return null
    const base = typeof window !== 'undefined' ? window.location.origin : ''
    const segment = supplier.slug || supplier.id
    return `${base}/supplier/${segment}`
  }, [supplier?.id, supplier?.slug])

  useEffect(() => {
    if (supplier) {
      setProfileForm({
        name: supplier.name || '',
        legal_name: supplier.legal_name || '',
        vat_no: supplier.vat_no || '',
        trade_license_no: supplier.trade_license_no || '',
        phone: supplier.phone || '',
        contact_email: supplier.contact_email || '',
        address: normalizeAddress(supplier.address_json),
        description: supplier.description || '',
        website: supplier.website || '',
      })
    }
  }, [supplier])

  const handleCopyCatalogLink = async () => {
    if (!catalogLink) return
    try {
      await navigator.clipboard.writeText(catalogLink)
      toast.success('Catalog link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const handleTogglePublicCatalog = async (enabled: boolean) => {
    if (!supplier?.id) return
    try {
      await updateSupplier({
        id: supplier.id,
        data: { publicCatalogEnabled: enabled } as Partial<typeof supplier> & {
          publicCatalogEnabled?: boolean
        },
      }).unwrap()
      toast.success(enabled ? 'Public catalog enabled' : 'Public catalog disabled')
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'data' in err
          ? (err as { data?: { error?: { message?: string } } }).data?.error?.message
          : undefined
      toast.error(message || 'Failed to update catalog setting')
    }
  }

  const handleLogoUpload = async (logoUrl: string) => {
    if (!supplier?.id) {
      toast.error('Supplier information not loaded')
      return
    }
    try {
      await uploadSupplierLogo({ id: supplier.id, logoUrl }).unwrap()
      refetchSupplier()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to upload logo')
    }
  }

  const handleGetPresignedUrl = async (params: {
    fileName: string
    fileType: string
    fileSize?: number
  }) => {
    return getPresignedUrl(params).unwrap()
  }

  const handleSaveProfile = async () => {
    if (!supplier?.id) {
      toast.error('Supplier information not loaded')
      return
    }

    try {
      await updateSupplier({
        id: supplier.id,
        data: {
          name: profileForm.name,
          vatNo: profileForm.vat_no,
          phone: profileForm.phone,
          contactEmail: profileForm.contact_email,
          address: profileForm.address,
        },
      }).unwrap()
      toast.success('Profile updated successfully!')
      refetchSupplier()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Failed to update profile')
    }
  }

  if (isLoadingSupplier) {
    return (
      <div className="flex items-center gap-3 text-sm text-[var(--text-muted)] py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading profile…
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Company Logo
          </CardTitle>
          <CardDescription>
            Upload your company logo. This will be displayed in your profile and to restaurants.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!brandingAllowed && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{customBrandingUpgradeMessage(entitlements?.plan?.name)}</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  openBrowseUpgrade(dispatch, {
                    currentPlan: entitlements?.plan?.name ?? null,
                    upgradeUrl: '/app/settings?tab=plan',
                  })
                }
              >
                Compare plans
              </Button>
            </div>
          )}
          {supplier ? (
            brandingAllowed ? (
              <LogoUpload
                currentLogo={supplier.logo_url}
                onUpload={handleLogoUpload}
                entityId={supplier.id}
                entityName={supplier.name || 'Supplier'}
                getPresignedUrl={handleGetPresignedUrl}
              />
            ) : supplier.logo_url ? (
              <img
                src={supplier.logo_url}
                alt={`${supplier.name || 'Supplier'} logo`}
                className="h-24 w-24 rounded-lg border object-contain bg-white"
              />
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Upgrade to Gold or Platinum to upload your logo.
              </p>
            )
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Loading supplier information...</p>
          )}
        </CardContent>
      </Card>

      {brandingAllowed && (
        <BrandingSettingsSection
          tenantType="SUPPLIER"
          canEdit={can('SETTINGS_EDIT') || can('SETTINGS_MANAGE')}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Supplier catalog link
          </CardTitle>
          <CardDescription>
            Share this link with restaurants so they can browse your catalog and request quotes
            without full onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input readOnly value={catalogLink ?? ''} className="font-mono text-sm" />
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={handleCopyCatalogLink}>
                <Copy className="h-4 w-4 mr-1" />
                Copy catalog link
              </Button>
              {catalogLink && (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={catalogLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Preview catalog
                  </a>
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[var(--app-border)] p-3">
            <div>
              <p className="text-sm font-medium">Public catalog enabled</p>
              <p className="text-xs text-[var(--text-muted)]">
                When off, the catalog link returns not found.
              </p>
            </div>
            <Button
              type="button"
              variant={supplier?.public_catalog_enabled !== false ? 'default' : 'outline'}
              size="sm"
              disabled={isUpdating}
              onClick={() => handleTogglePublicCatalog(supplier?.public_catalog_enabled === false)}
            >
              {supplier?.public_catalog_enabled !== false ? 'Enabled' : 'Disabled'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Information
          </CardTitle>
          <CardDescription>Update your company details and contact information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Company Name *</Label>
              <Input
                id="name"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                placeholder="Fresh Produce Co"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="legal_name">Legal Name</Label>
              <Input
                id="legal_name"
                value={profileForm.legal_name}
                onChange={(e) => setProfileForm({ ...profileForm, legal_name: e.target.value })}
                placeholder="Fresh Produce Co LLC"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vat_no">VAT Number</Label>
              <Input
                id="vat_no"
                value={profileForm.vat_no}
                onChange={(e) => setProfileForm({ ...profileForm, vat_no: e.target.value })}
                placeholder="VAT-123456"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trade_license_no">Trade License</Label>
              <Input
                id="trade_license_no"
                value={profileForm.trade_license_no}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, trade_license_no: e.target.value })
                }
                placeholder="TL-456789"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_email">Contact Email *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  id="contact_email"
                  type="email"
                  value={profileForm.contact_email}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, contact_email: e.target.value })
                  }
                  placeholder="contact@example.com"
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  id="phone"
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
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
                value={profileForm.website}
                onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })}
                placeholder="https://www.example.com"
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Company Description</Label>
            <Textarea
              id="description"
              value={profileForm.description}
              onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
              placeholder="Tell restaurants about your company..."
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="street">Street Address</Label>
              <Input
                id="street"
                value={profileForm.address.street}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    address: { ...profileForm.address, street: e.target.value },
                  })
                }
                placeholder="123 Main Street"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={profileForm.address.city}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    address: { ...profileForm.address, city: e.target.value },
                  })
                }
                placeholder="City Name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">Region/State</Label>
              <Input
                id="region"
                value={profileForm.address.region}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    address: { ...profileForm.address, region: e.target.value },
                  })
                }
                placeholder="State or Region"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={profileForm.address.country}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    address: { ...profileForm.address, country: e.target.value },
                  })
                }
                placeholder="Country"
              />
            </div>
          </div>

          <Button onClick={handleSaveProfile} disabled={isUpdating} className="w-full sm:w-auto">
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
    </div>
  )
}
