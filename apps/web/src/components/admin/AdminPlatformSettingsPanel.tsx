import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  useGetAdminPlatformSettingsQuery,
  useUpdateAdminPlatformSettingsMutation,
} from '../../services/api'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export function AdminPlatformSettingsPanel({
  variant = 'default',
}: {
  variant?: 'default' | 'compact'
}) {
  const { data, isLoading } = useGetAdminPlatformSettingsQuery()
  const [updateSettings, { isLoading: saving }] = useUpdateAdminPlatformSettingsMutation()
  const [days, setDays] = useState('30')

  useEffect(() => {
    if (data?.freeSandboxDays != null) {
      setDays(String(data.freeSandboxDays))
    }
  }, [data?.freeSandboxDays])

  const handleSave = async () => {
    const n = Number(days)
    if (!Number.isFinite(n) || n < 7 || n > 90) {
      toast.error('Enter a number between 7 and 90 days')
      return
    }
    try {
      await updateSettings({ freeSandboxDays: Math.round(n) }).unwrap()
      toast.success('Platform settings saved')
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to save settings'
      toast.error(msg)
    }
  }

  return (
    <Card
      className={variant === 'compact' ? 'border-[var(--app-border)]' : undefined}
      data-testid="admin-platform-settings-panel"
    >
      <CardHeader className={variant === 'compact' ? 'px-4 py-3' : undefined}>
        <CardTitle className={variant === 'compact' ? 'text-base' : undefined}>
          Free Trial length
        </CardTitle>
        <CardDescription>
          {variant === 'compact'
            ? 'Applies to new Free Trial activations platform-wide. Workspaces auto-lock after this period unless upgraded.'
            : 'Free Trial workspaces auto-lock after this many days unless the tenant upgrades to a paid plan. This is not a forever-free tier.'}
        </CardDescription>
      </CardHeader>
      <CardContent
        className={`space-y-4 max-w-sm ${variant === 'compact' ? 'px-4 pb-4 pt-0' : ''}`}
      >
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
        ) : (
          <>
            <div>
              <Label htmlFor="freeSandboxDays">Trial length (days)</Label>
              <Input
                id="freeSandboxDays"
                type="number"
                min={7}
                max={90}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Allowed range: 7–90 days (default 30)
              </p>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
