import { useEffect, type ReactNode } from 'react'
import {
  useGetRestaurantMeQuery,
  useGetSupplierMeQuery,
  useGetEntitlementsQuery,
} from '../services/api'
import { useImpersonation } from '../hooks/useImpersonation'
import { featureEnabled } from '../lib/planLimits'

const CSS_VARS = [
  '--brand',
  '--brand-mid',
  '--brand-light',
  '--brand-pale',
  '--brand-ultra',
] as const

function applyBrandingVars(
  branding: {
    brandPrimary?: string
    brandMid?: string
    brandLight?: string
    brandPale?: string
    brandUltra?: string
  } | null
) {
  const root = document.documentElement
  if (!branding || branding.brandPrimary === '#5b21b6') {
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

  const { data: restaurantMe } = useGetRestaurantMeQuery(undefined, {
    skip: !isEffectiveRestaurant || !brandingEnabled,
  })
  const { data: supplierMe } = useGetSupplierMeQuery(undefined, {
    skip: !isEffectiveSupplier || !brandingEnabled,
  })

  useEffect(() => {
    if (!brandingEnabled) {
      applyBrandingVars(null)
      return
    }
    const row = isEffectiveRestaurant
      ? restaurantMe?.restaurant
      : isEffectiveSupplier
        ? supplierMe?.supplier
        : null
    if (!row) {
      applyBrandingVars(null)
      return
    }
    const primary = row.brand_primary as string | undefined
    if (!primary) {
      applyBrandingVars(null)
      return
    }
    applyBrandingVars({
      brandPrimary: primary,
      brandMid: row.brand_accent || undefined,
    })
  }, [brandingEnabled, isEffectiveRestaurant, isEffectiveSupplier, restaurantMe, supplierMe])

  return <>{children}</>
}
