import { useEffect, useState } from 'react'
import { useGetTenantBrandingQuery, useUpdateTenantBrandingMutation } from '../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import toast from 'react-hot-toast'
import { Palette } from 'lucide-react'

type Props = {
  tenantType: 'RESTAURANT' | 'SUPPLIER'
  canEdit?: boolean
}

export function BrandingSettingsSection({ tenantType, canEdit = true }: Props) {
  const { data, isLoading } = useGetTenantBrandingQuery({ tenantType })
  const [updateBranding, { isLoading: saving }] = useUpdateTenantBrandingMutation()
  const [brandPrimary, setBrandPrimary] = useState('')
  const [brandAccent, setBrandAccent] = useState('')
  const [brandDisplayName, setBrandDisplayName] = useState('')

  useEffect(() => {
    const b = data?.branding
    if (b) {
      setBrandPrimary(b.brandPrimary === '#5b21b6' && b.isDefault ? '' : b.brandPrimary || '')
      setBrandAccent(b.brandAccent || '')
      setBrandDisplayName(b.brandDisplayName || '')
    }
  }, [data])

  const handleSave = async () => {
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

  if (isLoading) return null

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
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="brand-primary">Primary color</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="brand-primary"
                type="color"
                value={brandPrimary || '#5b21b6'}
                disabled={!canEdit}
                onChange={(e) => setBrandPrimary(e.target.value)}
                className="h-10 w-14 p-1"
              />
              <Input
                value={brandPrimary}
                disabled={!canEdit}
                placeholder="#5b21b6"
                onChange={(e) => setBrandPrimary(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="brand-accent">Accent color</Label>
            <div className="flex gap-2 mt-1">
              <Input
                id="brand-accent"
                type="color"
                value={brandAccent || '#7c3aed'}
                disabled={!canEdit}
                onChange={(e) => setBrandAccent(e.target.value)}
                className="h-10 w-14 p-1"
              />
              <Input
                value={brandAccent}
                disabled={!canEdit}
                placeholder="#7c3aed"
                onChange={(e) => setBrandAccent(e.target.value)}
              />
            </div>
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
            placeholder="Shown in header when set"
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
