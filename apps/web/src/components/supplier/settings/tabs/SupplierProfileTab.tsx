import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../ui/card'
import { Button } from '../../../ui/button'
import { Input } from '../../../ui/input'
import { Label } from '../../../ui/label'
import { Textarea } from '../../../ui/textarea'
import {
  Building2,
  Mail,
  Phone,
  Globe,
  Save,
  Loader2,
  Link2,
  Copy,
  ExternalLink,
} from 'lucide-react'
import { toast } from 'sonner'
import { TenantBrandingPanel } from '../../../settings/TenantBrandingPanel'
import { useAppSelector } from '../../../../hooks/redux'
import { usePermissions } from '../../../../hooks/usePermissions'
import { normalizeAddress } from '../../../../lib/address'
import {
  useGetSupplierMeQuery,
  useUpdateSupplierMutation,
  useUploadSupplierLogoMutation,
  useGetPresignedUrlMutation,
  useGetEntitlementsQuery,
} from '../../../../services/api'
import { ensureNamespace } from '../../../../i18n'

export function SupplierProfileTab() {
  const { t } = useTranslation('suppliers')
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
    void ensureNamespace('suppliers')
  }, [])

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
      toast.success(t('profile.toast.linkCopied'))
    } catch {
      toast.error(t('profile.toast.copyFailed'))
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
      toast.success(
        enabled ? t('profile.toast.catalogEnabled') : t('profile.toast.catalogDisabled')
      )
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'data' in err
          ? (err as { data?: { error?: { message?: string } } }).data?.error?.message
          : undefined
      toast.error(message || t('profile.toast.catalogUpdateFailed'))
    }
  }

  const handleLogoUpload = async (logoUrl: string) => {
    if (!supplier?.id) {
      toast.error(t('profile.toast.notLoaded'))
      throw new Error(t('profile.toast.notLoaded'))
    }
    try {
      await uploadSupplierLogo({ id: supplier.id, logoUrl }).unwrap()
      refetchSupplier()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('profile.toast.logoUploadFailed'))
      throw error
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
      toast.error(t('profile.toast.notLoaded'))
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
      toast.success(t('profile.toast.updated'))
      refetchSupplier()
    } catch (error: any) {
      toast.error(error?.data?.error?.message || t('profile.toast.updateFailed'))
    }
  }

  if (isLoadingSupplier) {
    return (
      <div className="flex items-center gap-3 text-sm text-[var(--text-muted)] py-8">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('profile.loading')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <TenantBrandingPanel
        tenantType="SUPPLIER"
        entityId={supplier?.id}
        entityName={supplier?.name || t('profile.defaultEntityName')}
        currentLogo={supplier?.logo_url}
        entitlements={entitlements}
        canEditBranding={can('SETTINGS_EDIT') || can('SETTINGS_MANAGE')}
        upgradeTab="plan"
        logoTitle={t('profile.logoTitle')}
        logoDescription={t('profile.logoDescription')}
        onLogoUpload={handleLogoUpload}
        getPresignedUrl={handleGetPresignedUrl}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            {t('profile.catalogLink.title')}
          </CardTitle>
          <CardDescription>{t('profile.catalogLink.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input readOnly value={catalogLink ?? ''} className="font-mono text-sm" />
            <div className="flex gap-2 shrink-0">
              <Button type="button" variant="outline" size="sm" onClick={handleCopyCatalogLink}>
                <Copy className="h-4 w-4 mr-1" />
                {t('profile.catalogLink.copy')}
              </Button>
              {catalogLink && (
                <Button type="button" variant="outline" size="sm" asChild>
                  <a href={catalogLink} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    {t('profile.catalogLink.preview')}
                  </a>
                </Button>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-[var(--app-border)] p-3">
            <div>
              <p className="text-sm font-medium">{t('profile.catalogLink.publicEnabled')}</p>
              <p className="text-xs text-[var(--text-muted)]">
                {t('profile.catalogLink.publicEnabledHint')}
              </p>
            </div>
            <Button
              type="button"
              variant={supplier?.public_catalog_enabled !== false ? 'default' : 'outline'}
              size="sm"
              disabled={isUpdating}
              onClick={() => handleTogglePublicCatalog(supplier?.public_catalog_enabled === false)}
            >
              {supplier?.public_catalog_enabled !== false
                ? t('profile.catalogLink.enabled')
                : t('profile.catalogLink.disabled')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {t('profile.companyInfo.title')}
          </CardTitle>
          <CardDescription>{t('profile.companyInfo.description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('profile.fields.companyName')}</Label>
              <Input
                id="name"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                placeholder={t('profile.placeholders.companyName')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="legal_name">{t('profile.fields.legalName')}</Label>
              <Input
                id="legal_name"
                value={profileForm.legal_name}
                onChange={(e) => setProfileForm({ ...profileForm, legal_name: e.target.value })}
                placeholder={t('profile.placeholders.legalName')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vat_no">{t('profile.fields.vatNumber')}</Label>
              <Input
                id="vat_no"
                value={profileForm.vat_no}
                onChange={(e) => setProfileForm({ ...profileForm, vat_no: e.target.value })}
                placeholder={t('profile.placeholders.vatNumber')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trade_license_no">{t('profile.fields.tradeLicense')}</Label>
              <Input
                id="trade_license_no"
                value={profileForm.trade_license_no}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, trade_license_no: e.target.value })
                }
                placeholder={t('profile.placeholders.tradeLicense')}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="contact_email">{t('profile.fields.contactEmail')}</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  id="contact_email"
                  type="email"
                  value={profileForm.contact_email}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, contact_email: e.target.value })
                  }
                  placeholder={t('profile.placeholders.contactEmail')}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('profile.fields.phone')}</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
                <Input
                  id="phone"
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder={t('profile.placeholders.phone')}
                  className="pl-10"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">{t('profile.fields.website')}</Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-[var(--text-muted)]" />
              <Input
                id="website"
                type="url"
                value={profileForm.website}
                onChange={(e) => setProfileForm({ ...profileForm, website: e.target.value })}
                placeholder={t('profile.placeholders.website')}
                className="pl-10"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('profile.fields.description')}</Label>
            <Textarea
              id="description"
              value={profileForm.description}
              onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
              placeholder={t('profile.placeholders.description')}
              rows={4}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="street">{t('profile.fields.street')}</Label>
              <Input
                id="street"
                value={profileForm.address.street}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    address: { ...profileForm.address, street: e.target.value },
                  })
                }
                placeholder={t('profile.placeholders.street')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">{t('profile.fields.city')}</Label>
              <Input
                id="city"
                value={profileForm.address.city}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    address: { ...profileForm.address, city: e.target.value },
                  })
                }
                placeholder={t('profile.placeholders.city')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="region">{t('profile.fields.region')}</Label>
              <Input
                id="region"
                value={profileForm.address.region}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    address: { ...profileForm.address, region: e.target.value },
                  })
                }
                placeholder={t('profile.placeholders.region')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="country">{t('profile.fields.country')}</Label>
              <Input
                id="country"
                value={profileForm.address.country}
                onChange={(e) =>
                  setProfileForm({
                    ...profileForm,
                    address: { ...profileForm.address, country: e.target.value },
                  })
                }
                placeholder={t('profile.placeholders.country')}
              />
            </div>
          </div>

          <Button onClick={handleSaveProfile} disabled={isUpdating} className="w-full sm:w-auto">
            {isUpdating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t('profile.saving')}
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                {t('profile.saveChanges')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
