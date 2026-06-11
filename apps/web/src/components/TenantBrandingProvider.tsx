import { useEffect, type ReactNode } from 'react'
import { useGetTenantBrandingQuery, useGetEntitlementsQuery } from '../services/api'
import { useImpersonation } from '../hooks/useImpersonation'
import { featureEnabled } from '../lib/planLimits'
import type { TenantBranding } from '../services/api/endpoints/restaurants'

const CSS_VARS = [
  '--brand',
  '--brand-mid',
  '--brand-light',
  '--brand-pale',
  '--brand-ultra',
] as const

function applyBrandingVars(branding: TenantBranding | null) {
  const root = document.documentElement
  if (!branding || branding.isDefault) {
    CSS_VARS.forEach((v) => root.style.removeProperty(v))
    return
  }
  if (branding.brandPrimary) root.style.setProperty('--brand', branding.brandPrimary)
  if (branding.brandMid) root.style.setProperty('--brand-mid', branding.brandMid)
  if (branding.brandLight) root.style.setProperty('--brand-light', branding.brandLight)
  if (branding.brandPale) root.style.setProperty('--brand-pale', branding.brandPale)
  if (branding.brandUltra) root.style.setProperty('--brand-ultra', branding.brandUltra)
}

export function TenantBrandingProvider({ children }: { children: ReactNode }) {
  const { isEffectiveRestaurant, isEffectiveSupplier } = useImpersonation()
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const brandingEnabled = featureEnabled(entitlementsData?.entitlements?.features?.custom_branding)

  const tenantType = isEffectiveRestaurant
    ? ('RESTAURANT' as const)
    : isEffectiveSupplier
      ? ('SUPPLIER' as const)
      : null

  const { data: brandingData } = useGetTenantBrandingQuery(
    { tenantType: tenantType! },
    { skip: !brandingEnabled || !tenantType }
  )

  useEffect(() => {
    if (!brandingEnabled) {
      applyBrandingVars(null)
      return
    }
    applyBrandingVars(brandingData?.branding ?? null)
  }, [brandingEnabled, brandingData])

  return <>{children}</>
}
