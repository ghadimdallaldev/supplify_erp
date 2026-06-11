import { useEffect, useState } from 'react'
import { useGetTenantBrandingQuery, useUpdateTenantBrandingMutation } from '../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Skeleton } from '../ui/skeleton'
import { EmptyState } from '../ui/empty-state'
import toast from 'react-hot-toast'
import { Palette } from 'lucide-react'

const HEX_RE = /^#([0-9A-Fa-f]{6})$/

function validateHex(value: string, fieldLabel: string): string | null {
  if (!value.trim()) return null
  if (!HEX_RE.test(value.trim())) {
    return `${fieldLabel} must be a valid hex color (#RRGGBB)`
  }
  return null
}

type Props = {
  tenantType: 'RESTAURANT' | 'SUPPLIER'
  canEdit?: boolean
}

export function BrandingSettingsSection({ tenantType, canEdit = true }: Props) {
  const { data, isLoading, isError, refetch } = useGetTenantBrandingQuery({ tenantType })
  const [updateBranding, { isLoading: saving }] = useUpdateTenantBrandingMutation()
  const [brandPrimary, setBrandPrimary] = useState('')
  const [brandAccent, setBrandAccent] = useState('')
  const [brandDisplayName, setBrandDisplayName] = useState('')
  const [primaryError, setPrimaryError] = useState<string | null>(null)
  const [accentError, setAccentError] = useState<string | null>(null)

  useEffect(() => {
    const b = data?.branding
    if (b) {
      setBrandPrimary(b.brandPrimary === '#5b21b6' && b.isDefault ? '' : b.brandPrimary || '')
      setBrandAccent(b.brandAccent || '')
      setBrandDisplayName(b.brandDisplayName || '')
    }
  }, [data])

  const handleSave = async () => {
    const nextPrimaryError = validateHex(brandPrimary, 'Primary color')
    const nextAccentError = validateHex(brandAccent, 'Accent color')
    setPrimaryError(nextPrimaryError)
    setAccentError(nextAccentError)
    if (nextPrimaryError || nextAccentError) return

    try {
      await updateBranding({
        tenantType,
        brandPrimary: brandPrimary || null,
        brandAccent: brandAccent || null,
        brandDisplayName: brandDisplayName || null,
      }).unwrap()
      toast.success('Branding updated')
    } catch (e: any) {
      toast.error(e?.data?.error?.message || 'Failed to save branding')
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-4 w-full max-w-md" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-9 w-28" />
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-6">
          <EmptyState
            title="Could not load branding settings"
            description="Try again in a moment."
            action={
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry
              </Button>
            }
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Palette className="h-4 w-4" />
          Brand colors
        </CardTitle>
        <CardDescription>
          Customize your workspace colors. Logo upload is available above. Custom domains are not
          yet supported.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canEdit && (
          <p className="text-sm text-[var(--text-muted)]">
            You don&apos;t have permission to edit branding.
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="brand-primary">Primary color</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="brand-primary"
                type="color"
                value={brandPrimary || '#5b21b6'}
                disabled={!canEdit}
                onChange={(e) => {
                  setBrandPrimary(e.target.value)
                  setPrimaryError(null)
                }}
                className="h-10 w-14 p-1"
              />
              <Input
                value={brandPrimary}
                disabled={!canEdit}
                placeholder="#5b21b6"
                onChange={(e) => {
                  setBrandPrimary(e.target.value)
                  setPrimaryError(null)
                }}
                aria-invalid={!!primaryError}
              />
            </div>
            {primaryError && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {primaryError}
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="brand-accent">Accent color</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="brand-accent"
                type="color"
                value={brandAccent || '#7c3aed'}
                disabled={!canEdit}
                onChange={(e) => {
                  setBrandAccent(e.target.value)
                  setAccentError(null)
                }}
                className="h-10 w-14 p-1"
              />
              <Input
                value={brandAccent}
                disabled={!canEdit}
                placeholder="#7c3aed"
                onChange={(e) => {
                  setBrandAccent(e.target.value)
                  setAccentError(null)
                }}
                aria-invalid={!!accentError}
              />
            </div>
            {accentError && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {accentError}
              </p>
            )}
          </div>
        </div>
        <div>
          <Label htmlFor="brand-display-name">Display name (optional)</Label>
          <Input
            id="brand-display-name"
            className="mt-1"
            disabled={!canEdit}
            value={brandDisplayName}
            onChange={(e) => setBrandDisplayName(e.target.value)}
            placeholder="Shown on your public supplier catalog when set"
          />
        </div>
        {canEdit && (
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save branding'}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
