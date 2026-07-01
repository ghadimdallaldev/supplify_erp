import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Gift, Loader2, Save, ShoppingBag, Truck, UtensilsCrossed } from 'lucide-react'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { RequirePermission } from '../../components/RequirePermission'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import {
  useGetConsumerLoyaltyProgramQuery,
  useUpsertConsumerLoyaltyProgramMutation,
} from '../../services/consumerApi'
import { toast } from 'sonner'
import {
  LoyaltyFormLoading,
  LoyaltyPanel,
  LoyaltySummaryStrip,
  LoyaltyToggleRow,
} from '../../components/loyalty/loyaltyShared'
import { ensureNamespace } from '../../i18n'
import { usePermissions } from '../../hooks/usePermissions'

export function ConsumerLoyaltyPage() {
  const { t } = useTranslation('consumer')
  const { can } = usePermissions()
  const canManageLoyalty = can('CATALOG_MANAGE')

  useEffect(() => {
    void ensureNamespace('consumer')
  }, [])

  const { data, isLoading } = useGetConsumerLoyaltyProgramQuery()
  const [saveProgram, { isLoading: saving }] = useUpsertConsumerLoyaltyProgramMutation()

  const program = data?.program
  const [form, setForm] = useState({
    name: t('loyalty.defaultName'),
    enabled: false,
    earnPointsPerCurrency: '1',
    redeemCurrencyPerPoint: '0.01',
    minRedeemPoints: '50',
    welcomeBonusPoints: '0',
    maxRedeemPercent: '50',
    takeawayMultiplier: '1',
    deliveryMultiplier: '1.25',
    dineInMultiplier: '1.5',
  })

  useEffect(() => {
    if (!program) return
    const multipliers = program.rules_json?.fulfillment_multipliers ?? {}
    setForm({
      name: program.name ?? t('loyalty.defaultName'),
      enabled: program.enabled ?? false,
      earnPointsPerCurrency: String(program.earn_points_per_currency ?? 1),
      redeemCurrencyPerPoint: String(program.redeem_currency_per_point ?? 0.01),
      minRedeemPoints: String(program.min_redeem_points ?? 50),
      welcomeBonusPoints: String(program.welcome_bonus_points ?? 0),
      maxRedeemPercent: String(program.max_redeem_percent ?? 50),
      takeawayMultiplier: String(multipliers.TAKEAWAY ?? multipliers.pickup ?? 1),
      deliveryMultiplier: String(multipliers.DELIVERY ?? multipliers.delivery ?? 1.25),
      dineInMultiplier: String(multipliers.DINE_IN ?? multipliers.dine_in ?? 1.5),
    })
  }, [program, t])

  const summary = useMemo(
    () => ({
      earnRate: t('loyalty.earnRateSummary', { points: form.earnPointsPerCurrency }),
      redeemValue: t('loyalty.redeemValueSummary', { value: form.redeemCurrencyPerPoint }),
      minRedeem: t('loyalty.minRedeemSummary', { points: form.minRedeemPoints }),
    }),
    [form.earnPointsPerCurrency, form.redeemCurrencyPerPoint, form.minRedeemPoints, t]
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await saveProgram({
        name: form.name.trim(),
        enabled: form.enabled,
        earnPointsPerCurrency: Number(form.earnPointsPerCurrency),
        redeemCurrencyPerPoint: Number(form.redeemCurrencyPerPoint),
        minRedeemPoints: Number(form.minRedeemPoints),
        welcomeBonusPoints: Number(form.welcomeBonusPoints),
        maxRedeemPercent: Number(form.maxRedeemPercent),
        rulesJson: {
          fulfillment_multipliers: {
            TAKEAWAY: Number(form.takeawayMultiplier),
            DELIVERY: Number(form.deliveryMultiplier),
            DINE_IN: Number(form.dineInMultiplier),
            pickup: Number(form.takeawayMultiplier),
            delivery: Number(form.deliveryMultiplier),
            dine_in: Number(form.dineInMultiplier),
          },
        },
      }).unwrap()
      toast.success(t('loyalty.programSaved'))
    } catch (error: any) {
      toast.error(error?.data?.message || error?.data?.error?.message || t('loyalty.unableSave'))
    }
  }

  return (
    <RequirePermission permission="CATALOG_VIEW">
      <PageShell className="space-y-6" data-testid="consumer-loyalty-page">
        <PageHeader title={t('loyalty.title')} description={t('loyalty.description')} />

        {isLoading ? (
          <LoyaltyFormLoading />
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <fieldset disabled={!canManageLoyalty} className="space-y-4">
              <LoyaltySummaryStrip
                enabled={form.enabled}
                programName={form.name.trim() || t('loyalty.defaultName')}
                earnRate={summary.earnRate}
                redeemValue={summary.redeemValue}
                minRedeem={summary.minRedeem}
              />

              <LoyaltyPanel
                title={t('loyalty.program')}
                description={t('loyalty.programDescription')}
              >
                <div className="-mx-4 -mt-4 divide-y divide-[var(--app-border)] sm:-mx-5">
                  <LoyaltyToggleRow
                    id="enabled"
                    label={t('loyalty.programEnabled')}
                    description={t('loyalty.programEnabledDescription')}
                    icon={Gift}
                    checked={form.enabled}
                    onCheckedChange={(enabled) => setForm((f) => ({ ...f, enabled }))}
                  />
                  <div className="px-4 py-4 sm:px-5">
                    <div className="space-y-1">
                      <Label htmlFor="name">{t('loyalty.programName')}</Label>
                      <Input
                        id="name"
                        value={form.name}
                        onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                        placeholder={t('loyalty.programNamePlaceholder')}
                      />
                    </div>
                  </div>
                </div>
              </LoyaltyPanel>

              <LoyaltyPanel
                title={t('loyalty.earnRedeem')}
                description={t('loyalty.earnRedeemDescription')}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="welcomeBonus">{t('loyalty.welcomeBonus')}</Label>
                    <Input
                      id="welcomeBonus"
                      type="number"
                      min={0}
                      value={form.welcomeBonusPoints}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, welcomeBonusPoints: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="earnRate">{t('loyalty.earnPerDollar')}</Label>
                    <Input
                      id="earnRate"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.earnPointsPerCurrency}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, earnPointsPerCurrency: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="redeemRate">{t('loyalty.redeemPerPoint')}</Label>
                    <Input
                      id="redeemRate"
                      type="number"
                      min={0}
                      step="0.001"
                      value={form.redeemCurrencyPerPoint}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, redeemCurrencyPerPoint: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="minRedeem">{t('loyalty.minRedeem')}</Label>
                    <Input
                      id="minRedeem"
                      type="number"
                      min={0}
                      value={form.minRedeemPoints}
                      onChange={(e) => setForm((f) => ({ ...f, minRedeemPoints: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="maxRedeem">{t('loyalty.maxRedeem')}</Label>
                    <Input
                      id="maxRedeem"
                      type="number"
                      min={0}
                      max={100}
                      value={form.maxRedeemPercent}
                      onChange={(e) => setForm((f) => ({ ...f, maxRedeemPercent: e.target.value }))}
                      className="max-w-xs"
                    />
                  </div>
                </div>
              </LoyaltyPanel>

              <LoyaltyPanel
                title={t('loyalty.multipliers')}
                description={t('loyalty.multipliersDescription')}
                footer={
                  <Button type="submit" disabled={saving}>
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('loyalty.saving')}
                      </>
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        {t('loyalty.saveProgram')}
                      </>
                    )}
                  </Button>
                }
              >
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label htmlFor="takeawayMult" className="flex items-center gap-1.5">
                      <ShoppingBag className="h-3.5 w-3.5 text-[var(--brand-mid)]" aria-hidden />
                      {t('fulfillment.TAKEAWAY')}
                    </Label>
                    <Input
                      id="takeawayMult"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.takeawayMultiplier}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, takeawayMultiplier: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="deliveryMult" className="flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5 text-[var(--brand-mid)]" aria-hidden />
                      {t('fulfillment.DELIVERY')}
                    </Label>
                    <Input
                      id="deliveryMult"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.deliveryMultiplier}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, deliveryMultiplier: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dineInMult" className="flex items-center gap-1.5">
                      <UtensilsCrossed
                        className="h-3.5 w-3.5 text-[var(--brand-mid)]"
                        aria-hidden
                      />
                      {t('fulfillment.DINE_IN')}
                    </Label>
                    <Input
                      id="dineInMult"
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.dineInMultiplier}
                      onChange={(e) => setForm((f) => ({ ...f, dineInMultiplier: e.target.value }))}
                    />
                  </div>
                </div>
              </LoyaltyPanel>
            </fieldset>
            {canManageLoyalty ? null : (
              <p className="text-sm text-muted-foreground">{t('loyalty.readOnlyHint')}</p>
            )}
          </form>
        )}
      </PageShell>
    </RequirePermission>
  )
}
