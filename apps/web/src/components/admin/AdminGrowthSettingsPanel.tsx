import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
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

export function AdminGrowthSettingsPanel() {
  const { t } = useTranslation('admin')
  const { data, isLoading } = useGetAdminGrowthSettingsQuery()
  const [update, { isLoading: saving }] = useUpdateAdminGrowthSettingsMutation()
  const [discount, setDiscount] = useState('20')
  const [validityDays, setValidityDays] = useState('90')
  const [rewardType, setRewardType] = useState<'free_month' | 'account_credit'>('free_month')
  const [sponsorshipLimits, setSponsorshipLimits] =
    useState<SponsorshipLimitForm>(EMPTY_SPONSORSHIP_LIMITS)
  const [sponsorshipEnabled, setSponsorshipEnabled] = useState(true)
  const [offerExpiryDays, setOfferExpiryDays] = useState('14')
  const [referralDiscountAppliesTo, setReferralDiscountAppliesTo] = useState<
    'first_restaurant_funded' | 'sponsored_cycle'
  >('first_restaurant_funded')
  const [requirePm, setRequirePm] = useState(false)

  useEffect(() => {
    if (data) {
      setDiscount(String(data.firstPaidDiscountPercent))
      setValidityDays(String(data.referralValidityDays))
      setRewardType(data.supplierRewardType)
      setSponsorshipLimits(sponsorshipLimitsFromData(data.sponsorshipLimitsPerYear))
      setSponsorshipEnabled(data.sponsorshipEnabled !== false)
      setOfferExpiryDays(String(data.offerExpiryDays ?? 14))
      setReferralDiscountAppliesTo(
        data.referralDiscountAppliesTo === 'sponsored_cycle'
          ? 'sponsored_cycle'
          : 'first_restaurant_funded'
      )
      setRequirePm(Boolean(data.requireRestaurantPaymentMethodBeforeActivation))
    }
  }, [data])

  const parseSponsorshipLimits = (
    form: SponsorshipLimitForm
  ): Record<string, number | null> | null => {
    const parsed: Record<string, number | null> = {}
    for (const key of SPONSORSHIP_PLAN_KEYS) {
      const raw = form[key].trim()
      if (!raw) {
        parsed[key] = null
        continue
      }
      const num = Number(raw)
      if (!Number.isFinite(num) || num < 0 || !Number.isInteger(num)) {
        toast.error(
          t('growthToasts.sponsorshipLimitInvalid', { plan: SPONSORSHIP_PLAN_LABELS[key] })
        )
        return null
      }
      parsed[key] = num
    }
    return parsed
  }

  const handleSave = async () => {
    const discountNum = Number(discount)
    const validityNum = Number(validityDays)
    const offerDays = Number(offerExpiryDays)
    if (!Number.isFinite(discountNum) || discountNum < 0 || discountNum > 100) {
      toast.error(t('growthToasts.discountRange'))
      return
    }
    if (!Number.isFinite(validityNum) || validityNum < 1) {
      toast.error(t('growthToasts.validityMin'))
      return
    }
    if (!Number.isFinite(offerDays) || offerDays < 1 || offerDays > 90) {
      toast.error(t('growthToasts.offerExpiryRange'))
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
        sponsorshipEnabled,
        offerExpiryDays: Math.round(offerDays),
        referralDiscountAppliesTo,
        requireRestaurantPaymentMethodBeforeActivation: requirePm,
        supplierPaymentAfterAcceptance: true,
        supportedBillingIntervals: ['MONTHLY'],
      }).unwrap()
      toast.success(t('growthToasts.saved'))
    } catch {
      toast.error(t('growthToasts.saveFailed'))
    }
  }

  return (
    <Card data-testid="admin-growth-settings-panel">
      <CardHeader>
        <CardTitle>{t('growth.title')}</CardTitle>
        <CardDescription>{t('growth.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 max-w-md">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-muted)]" />
        ) : (
          <>
            <div>
              <Label htmlFor="firstPaidDiscount">{t('growth.firstPaidDiscount')}</Label>
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
              <Label htmlFor="referralValidity">{t('growth.referralValidity')}</Label>
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
              <Label htmlFor="supplierReward">{t('growth.supplierReward')}</Label>
              <select
                id="supplierReward"
                className="mt-1 w-full rounded-md border border-[var(--app-border)] bg-transparent px-3 py-2 text-sm"
                value={rewardType}
                onChange={(e) => setRewardType(e.target.value as 'free_month' | 'account_credit')}
              >
                <option value="free_month">{t('growth.rewardOptions.freeMonth')}</option>
                <option value="account_credit">{t('growth.rewardOptions.accountCredit')}</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="sponsorshipEnabled"
                type="checkbox"
                checked={sponsorshipEnabled}
                onChange={(e) => setSponsorshipEnabled(e.target.checked)}
              />
              <Label htmlFor="sponsorshipEnabled">{t('growth.sponsorshipEnabled')}</Label>
            </div>
            <div>
              <Label htmlFor="offerExpiry">{t('growth.offerExpiry')}</Label>
              <Input
                id="offerExpiry"
                type="number"
                min={1}
                max={90}
                value={offerExpiryDays}
                onChange={(e) => setOfferExpiryDays(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="discountApplies">{t('growth.discountApplies')}</Label>
              <select
                id="discountApplies"
                className="mt-1 w-full rounded-md border border-[var(--app-border)] bg-transparent px-3 py-2 text-sm"
                value={referralDiscountAppliesTo}
                onChange={(e) =>
                  setReferralDiscountAppliesTo(
                    e.target.value as 'first_restaurant_funded' | 'sponsored_cycle'
                  )
                }
              >
                <option value="first_restaurant_funded">
                  {t('growth.discountAppliesOptions.firstRestaurantFunded')}
                </option>
                <option value="sponsored_cycle">
                  {t('growth.discountAppliesOptions.sponsoredCycle')}
                </option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                id="requirePm"
                type="checkbox"
                checked={requirePm}
                onChange={(e) => setRequirePm(e.target.checked)}
              />
              <Label htmlFor="requirePm">{t('growth.requirePm')}</Label>
            </div>
            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-[var(--text)]">
                {t('growth.sponsorshipLimitsTitle')}
              </legend>
              <p className="text-xs text-[var(--text-muted)]">
                {t('growth.sponsorshipLimitsDescription')}
              </p>
              {SPONSORSHIP_PLAN_KEYS.map((planKey) => (
                <div key={planKey}>
                  <Label htmlFor={`sponsorship-${planKey}`}>
                    {SPONSORSHIP_PLAN_LABELS[planKey]} ({planKey})
                  </Label>
                  <Input
                    id={`sponsorship-${planKey}`}
                    type="number"
                    min={0}
                    placeholder={planKey === 'enterprise' ? t('growth.unlimitedPlaceholder') : '0'}
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
              {saving ? t('growth.saving') : t('growth.saveButton')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
