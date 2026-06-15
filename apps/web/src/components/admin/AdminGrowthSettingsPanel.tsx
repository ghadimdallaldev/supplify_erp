import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  useGetAdminGrowthSettingsQuery,
  useUpdateAdminGrowthSettingsMutation,
} from '../../services/api/endpoints/growth'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export function AdminGrowthSettingsPanel() {
  const { data, isLoading } = useGetAdminGrowthSettingsQuery()
  const [update, { isLoading: saving }] = useUpdateAdminGrowthSettingsMutation()
  const [discount, setDiscount] = useState('20')
  const [validityDays, setValidityDays] = useState('90')
  const [rewardType, setRewardType] = useState<'free_month' | 'account_credit'>('free_month')

  useEffect(() => {
    if (data) {
      setDiscount(String(data.firstPaidDiscountPercent))
      setValidityDays(String(data.referralValidityDays))
      setRewardType(data.supplierRewardType)
    }
  }, [data])

  const handleSave = async () => {
    const discountNum = Number(discount)
    const validityNum = Number(validityDays)
    if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > 100) {
      toast.error('Discount must be between 0 and 100 percent')
      return
    }
    if (!Number.isFinite(validityNum) || validityNum < 1) {
      toast.error('Referral validity must be at least 1 day')
      return
    }
    try {
      await update({
        firstPaidDiscountPercent: Math.round(discountNum),
        referralValidityDays: Math.round(validityNum),
        supplierRewardType: rewardType,
      }).unwrap()
      toast.success('Growth program settings saved')
    } catch {
      toast.error('Failed to save growth settings')
    }
  }

  return (
    <Card data-testid="admin-growth-settings-panel">
      <CardHeader>
        <CardTitle>Referral &amp; sponsorship program</CardTitle>
        <CardDescription>
          Configure referral discounts, supplier rewards, and sponsorship limits (stored in platform
          settings).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
        ) : (
          <>
            <div>
              <Label htmlFor="firstPaidDiscount">First paid subscription discount (%)</Label>
              <Input
                id="firstPaidDiscount"
                type="number"
                min={0}
                max={100}
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="referralValidity">Referral validity (days)</Label>
              <Input
                id="referralValidity"
                type="number"
                min={1}
                value={validityDays}
                onChange={(e) => setValidityDays(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="supplierReward">Supplier conversion reward</Label>
              <select
                id="supplierReward"
                className="mt-1 w-full rounded-md border border-[var(--app-border)] bg-transparent px-3 py-2 text-sm"
                value={rewardType}
                onChange={(e) => setRewardType(e.target.value as 'free_month' | 'account_credit')}
              >
                <option value="free_month">1 free month of subscription</option>
                <option value="account_credit">Account credit (platform billing)</option>
              </select>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save growth settings'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
