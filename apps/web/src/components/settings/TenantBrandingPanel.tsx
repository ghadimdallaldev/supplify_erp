import { useAppDispatch } from '../../hooks/redux'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { FileText } from 'lucide-react'
import { LogoUpload } from '../LogoUpload'
import { BrandingSettingsSection } from './BrandingSettingsSection'
import { canUseCustomBranding, customBrandingUpgradeMessage } from '../../lib/planLimits'
import { openBrowseUpgrade } from '../../lib/openBrowseUpgrade'
import type { Entitlements } from '../../types'

type PresignedUrlParams = {
  fileName: string
  fileType: string
  fileSize?: number
}

type PresignedUrlResult = {
  presignedUrl: string
  publicUrl?: string
  fileKey: string
  fileName: string
  fileType: string
}

type Props = {
  tenantType: 'RESTAURANT' | 'SUPPLIER'
  entityId?: string
  entityName: string
  currentLogo?: string | null
  entitlements?: Entitlements | null
  canEditBranding: boolean
  upgradeTab: 'plan' | 'subscription'
  logoTitle?: string
  logoDescription?: string
  onLogoUpload: (logoUrl: string) => Promise<void>
  getPresignedUrl: (params: PresignedUrlParams) => Promise<PresignedUrlResult>
}

export function TenantBrandingPanel({
  tenantType,
  entityId,
  entityName,
  currentLogo,
  entitlements,
  canEditBranding,
  upgradeTab,
  logoTitle = 'Company Logo',
  logoDescription = 'Upload your company logo. This will be displayed in your profile.',
  onLogoUpload,
  getPresignedUrl,
}: Props) {
  const dispatch = useAppDispatch()
  const brandingAllowed = canUseCustomBranding(entitlements)

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {logoTitle}
          </CardTitle>
          <CardDescription>{logoDescription}</CardDescription>
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
                    upgradeUrl: `/app/settings?tab=${upgradeTab}`,
                  })
                }
              >
                Compare plans
              </Button>
            </div>
          )}
          {entityId ? (
            brandingAllowed ? (
              <LogoUpload
                currentLogo={currentLogo}
                onUpload={onLogoUpload}
                entityId={entityId}
                entityName={entityName}
                getPresignedUrl={getPresignedUrl}
              />
            ) : currentLogo ? (
              <img
                src={currentLogo}
                alt={`${entityName} logo`}
                className="h-24 w-24 rounded-lg border object-contain bg-white"
              />
            ) : (
              <p className="text-sm text-[var(--text-muted)]">
                Upgrade to Gold or Platinum to upload your logo.
              </p>
            )
          ) : (
            <p className="text-sm text-[var(--text-muted)]">Loading tenant information...</p>
          )}
        </CardContent>
      </Card>

      {brandingAllowed && (
        <BrandingSettingsSection tenantType={tenantType} canEdit={canEditBranding} />
      )}
    </>
  )
}
