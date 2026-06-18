import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Gift, Loader2, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { RequirePermission } from '../../components/RequirePermission'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import {
  useGetSupplierLoyaltyBalancesQuery,
  useGetSupplierLoyaltyProgramQuery,
  useUpsertSupplierLoyaltyProgramMutation,
} from '../../services/api'
import { toast } from 'sonner'
import {
  LoyaltyFormLoading,
  LoyaltyPanel,
  LoyaltySummaryStrip,
  LoyaltyToggleRow,
} from '../../components/loyalty/loyaltyShared'
import { ensureNamespace } from '../../i18n'
import { formatNumber } from '../../utils/format'
import { Skeleton } from '../../components/ui/skeleton'

export function LoyaltyProgramPage() {
  const { t } = useTranslation('loyalty')
  const { data, isLoading } = useGetSupplierLoyaltyProgramQuery()
  const { data: balancesData, isLoading: balancesLoading } = useGetSupplierLoyaltyBalancesQuery()
  const [saveProgram, { isLoading: saving }] = useUpsertSupplierLoyaltyProgramMutation()

  const program = data?.program
  const [form, setForm] = useState({
    name: 'Partner rewards',
    enabled: false,
    earnPointsPerCurrency: '1',
    redeemCurrencyPerPoint: '0.01',
    minRedeemPoints: '50',
    maxRedeemPercent: '50',
  })

  useEffect(() => {
    void ensureNamespace('loyalty')
  }, [])

  useEffect(() => {
    if (!program) return
    setForm({
      name: program.name ?? 'Partner rewards',
      enabled: program.enabled ?? false,
      earnPointsPerCurrency: String(program.earn_points_per_currency ?? 1),
      redeemCurrencyPerPoint: String(program.redeem_currency_per_point ?? 0.01),
      minRedeemPoints: String(program.min_redeem_points ?? 50),
      maxRedeemPercent: String(program.max_redeem_percent ?? 50),
    })
  }, [program])

  const summary = useMemo(
    () => ({
      earnRate: t('summary.earnRate', { points: form.earnPointsPerCurrency }),
      redeemValue: t('summary.redeemValue', { value: form.redeemCurrencyPerPoint }),
      minRedeem: t('summary.minRedeem', { points: form.minRedeemPoints }),
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
        maxRedeemPercent: Number(form.maxRedeemPercent),
      }).unwrap()
      toast.success(t('toast.saved'))
    } catch (error: any) {
      toast.error(error?.data?.message || error?.data?.error?.message || t('toast.saveFailed'))
    }
  }

  const balances = balancesData?.balances ?? []

  return (
    <RequirePermission permission="CATALOG_VIEW">
      <PageShell maxWidth="focused" className="space-y-6" data-testid="loyalty-program-page">
        <PageHeader title={t('page.title')} description={t('page.description')} />

        {isLoading ? (
          <LoyaltyFormLoading />
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <LoyaltySummaryStrip
              enabled={form.enabled}
              programName={form.name.trim() || t('page.defaultProgramName')}
              earnRate={summary.earnRate}
              redeemValue={summary.redeemValue}
              minRedeem={summary.minRedeem}
            />

            <LoyaltyPanel
              title={t('programSettings.title')}
              description={t('programSettings.description')}
              footer={
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {t('programSettings.save')}
                </Button>
              }
            >
              <div className="-mx-4 -mt-4 divide-y divide-[var(--app-border)] sm:-mx-5">
                <LoyaltyToggleRow
                  id="supplier-loyalty-enabled"
                  label={t('programSettings.enabledLabel')}
                  description={t('programSettings.enabledDescription')}
                  icon={Gift}
                  checked={form.enabled}
                  onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
                />
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="loyalty-name">{t('programSettings.nameLabel')}</Label>
                  <Input
                    id="loyalty-name"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loyalty-earn">{t('programSettings.earnLabel')}</Label>
                  <Input
                    id="loyalty-earn"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.earnPointsPerCurrency}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, earnPointsPerCurrency: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loyalty-redeem">{t('programSettings.redeemLabel')}</Label>
                  <Input
                    id="loyalty-redeem"
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.redeemCurrencyPerPoint}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, redeemCurrencyPerPoint: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="loyalty-min">{t('programSettings.minRedeemLabel')}</Label>
                  <Input
                    id="loyalty-min"
                    type="number"
                    min="0"
                    step="1"
                    value={form.minRedeemPoints}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, minRedeemPoints: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="loyalty-max-percent">{t('programSettings.maxRedeemLabel')}</Label>
                  <Input
                    id="loyalty-max-percent"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={form.maxRedeemPercent}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, maxRedeemPercent: e.target.value }))
                    }
                  />
                </div>
              </div>
            </LoyaltyPanel>
          </form>
        )}

        <LoyaltyPanel title={t('balances.title')} description={t('balances.description')}>
          {balancesLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : balances.length === 0 ? (
            <p className="text-sm text-[var(--text-mid)]">{t('balances.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--app-border)] text-xs text-[var(--text-mid)]">
                    <th className="pb-2 pr-4 font-medium">{t('balances.columns.restaurant')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('balances.columns.balance')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('balances.columns.earned')}</th>
                    <th className="pb-2 font-medium">{t('balances.columns.redeemed')}</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((row) => (
                    <tr key={row.id} className="border-b border-[var(--app-border)] last:border-0">
                      <td className="py-2.5 pr-4">
                        <Link
                          to={`/app/restaurants/${row.restaurant_id}`}
                          className="font-medium text-[var(--brand-mid)] hover:underline"
                        >
                          {row.restaurant_name}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums">
                        {formatNumber(row.points_balance)}
                      </td>
                      <td className="py-2.5 pr-4 tabular-nums">
                        {formatNumber(row.lifetime_earned)}
                      </td>
                      <td className="py-2.5 tabular-nums">{formatNumber(row.lifetime_redeemed)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </LoyaltyPanel>
      </PageShell>
    </RequirePermission>
  )
}
