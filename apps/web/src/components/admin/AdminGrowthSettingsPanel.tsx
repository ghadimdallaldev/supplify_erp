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

import { SPONSORSHIP_PLAN_KEYS, SPONSORSHIP_PLAN_LABELS } from '../../lib/growthSponsorshipPlans'

type SponsorshipLimitForm = Record<(typeof SPONSORSHIP_PLAN_KEYS)[number], string>

const EMPTY_SPONSORSHIP_LIMITS: SponsorshipLimitForm = {
  silver: '2',
  gold: '10',
  platinum: '25',
  enterprise: '',
}

function sponsorshipLimitsFromData(
  limits: Record<string, number | null> | undefined
): SponsorshipLimitForm {
  return SPONSORSHIP_PLAN_KEYS.reduce((acc, key) => {
    const value = limits?.[key]
    acc[key] = value == null ? '' : String(value)
    return acc
  }, {} as SponsorshipLimitForm)
}

function parseSponsorshipLimits(form: SponsorshipLimitForm): Record<string, number | null> | null {
  const parsed: Record<string, number | null> = {}
  for (const key of SPONSORSHIP_PLAN_KEYS) {
    const raw = form[key].trim()
    if (!raw) {
      parsed[key] = null
      continue
    }
    const num = Number(raw)
    if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
      toast.error(`Sponsorship limit for ${SPONSORSHIP_PLAN_LABELS[key]} must be a whole number`)
      return null
    }
    parsed[key] = num
  }
  return parsed
}

export function AdminGrowthSettingsPanel() {
  const { data, isLoading } = useGetAdminGrowthSettingsQuery()
  const [update, { isLoading: saving }] = useUpdateAdminGrowthSettingsMutation()
  const [discount, setDiscount] = useState('20')
  const [validityDays, setValidityDays] = useState('90')
  const [rewardType, setRewardType] = useState<'free_month' | 'account_credit'>('free_month')
  const [sponsorshipLimits, setSponsorshipLimits] =
    useState<SponsorshipLimitForm>(EMPTY_SPONSORSHIP_LIMITS)

  useEffect(() => {
    if (data) {
      setDiscount(String(data.firstPaidDiscountPercent))
      setValidityDays(String(data.referralValidityDays))
      setRewardType(data.supplierRewardType)
      setSponsorshipLimits(sponsorshipLimitsFromData(data.sponsorshipLimitsPerYear))
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
    const parsedLimits = parseSponsorshipLimits(sponsorshipLimits)
    if (!parsedLimits) return
    try {
      await update({
        firstPaidDiscountPercent: Math.round(discountNum),
        referralValidityDays: Math.round(validityNum),
        supplierRewardType: rewardType,
        sponsorshipLimitsPerYear: parsedLimits,
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
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-[var(--text)]">
                Sponsorship limits per year
              </legend>
              <p className="text-xs text-[var(--text-muted)]">
                Max sponsored onboarding gifts a supplier can grant per calendar year, by plan tier.
                Leave blank for unlimited.
              </p>
              {SPONSORSHIP_PLAN_KEYS.map((planKey) => (
                <div key={planKey}>
                  <Label htmlFor={`sponsorship-${planKey}`}>
                    {SPONSORSHIP_PLAN_LABELS[planKey]} plan
                  </Label>
                  <Input
                    id={`sponsorship-${planKey}`}
                    type="number"
                    min={0}
                    placeholder={planKey === 'enterprise' ? 'Unlimited' : '0'}
                    value={sponsorshipLimits[planKey]}
                    onChange={(e) =>
                      setSponsorshipLimits((prev) => ({ ...prev, [planKey]: e.target.value }))
                    }
                    className="mt-1"
                  />
                </div>
              ))}
            </fieldset>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save growth settings'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
