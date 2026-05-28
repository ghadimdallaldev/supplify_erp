import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  useGetAdminPlatformSettingsQuery,
  useUpdateAdminPlatformSettingsMutation,
} from '../../services/api'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'

export function AdminPlatformSettingsPanel() {
  const { data, isLoading } = useGetAdminPlatformSettingsQuery()
  const [updateSettings, { isLoading: saving }] = useUpdateAdminPlatformSettingsMutation()
  const [days, setDays] = useState('7')

  useEffect(() => {
    if (data?.freeSandboxDays != null) {
      setDays(String(data.freeSandboxDays))
    }
  }, [data?.freeSandboxDays])

  const handleSave = async () => {
    const n = Number(days)
    if (!Number.isFinite(n) || n < 3 || n > 7) {
      toast.error('Enter a number between 3 and 7 days')
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
    <Card>
      <CardHeader>
        <CardTitle>Free Trial length</CardTitle>
        <CardDescription>
          Free Trial workspaces auto-lock after this many days unless the tenant upgrades to a paid
          plan. This is not a forever-free tier.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-sm">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
        ) : (
          <>
            <div>
              <Label htmlFor="freeSandboxDays">Trial length (days)</Label>
              <Input
                id="freeSandboxDays"
                type="number"
                min={3}
                max={7}
                value={days}
                onChange={(e) => setDays(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-[var(--text-muted)] mt-1">Allowed range: 3–7 days</p>
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
