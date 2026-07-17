import { CheckCircle2, CreditCard, Loader2, Lock, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { useGetBillingStatusQuery, useGetSubscriptionPlansQuery } from '../services/api'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { activateFreePlanFromPlans } from '../lib/activateFreePlan'
import { canLeaveActivationPage } from '../lib/refetchAppSession'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ensureNamespace } from '../i18n'

type TrialPlan = {
  id: string
  code?: string
  name?: string
  display_name?: string
  price_per_month?: number | null
  is_active?: boolean
  requires_admin_assignment?: boolean | null
}

function isTrialSelectablePlan(plan: TrialPlan) {
  const code = (plan.code || '').toLowerCase()
  return (
    code !== 'free' &&
    code !== 'enterprise' &&
    plan.is_active !== false &&
    plan.requires_admin_assignment !== true
  )
}

function formatMonthlyPrice(value: number | null | undefined) {
  const amount = Number(value ?? 0)
  if (amount <= 0) return '$0/mo'
  return (
    new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount) + '/mo'
  )
}

export function AccountActivationPage() {
  const { t } = useTranslation('onboarding')
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const { data: billing, isLoading } = useGetBillingStatusQuery()
  const { data: plansData } = useGetSubscriptionPlansQuery()
  const [activatingFree, setActivatingFree] = useState(false)
  const [selectedTrialPlanId, setSelectedTrialPlanId] = useState<string | null>(null)

  const pending = billing?.access?.pendingActivation && billing.access.isLocked
  const isSupplier = user?.role === 'SUPPLIER'
  const trialPlans = useMemo(
    () => ((plansData?.plans || []) as TrialPlan[]).filter(isTrialSelectablePlan),
    [plansData?.plans]
  )
  const selectedTrialPlan = trialPlans.find((plan) => plan.id === selectedTrialPlanId)

  useEffect(() => {
    void ensureNamespace('onboarding')
  }, [])

  useEffect(() => {
    if (selectedTrialPlanId || trialPlans.length === 0) return
    setSelectedTrialPlanId(trialPlans[0].id)
  }, [selectedTrialPlanId, trialPlans])

  useEffect(() => {
    if (isLoading || !billing?.access) return
    if (canLeaveActivationPage(billing.access)) {
      navigate('/app', { replace: true })
    }
  }, [billing, isLoading, navigate])

  const handleActivateFree = async () => {
    setActivatingFree(true)
    const result = await activateFreePlanFromPlans(dispatch, plansData?.plans, selectedTrialPlanId)
    setActivatingFree(false)
    if (result.ok) {
      toast.success(t('activation.trialActive'))
      navigate('/app', { replace: true })
      return
    }
    toast.error(result.message)
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl items-center justify-center p-6">
      <Card className="w-full border-2 shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--brand-ultra)] text-[var(--brand-mid)]">
            <Lock className="h-7 w-7" aria-hidden />
          </div>
          <PageHeader
            title={t('activation.title')}
            description={
              isSupplier
                ? t('activation.descriptionSupplier')
                : t('activation.descriptionRestaurant')
            }
            className="text-center sm:flex-col sm:items-center [&_p]:mx-auto"
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)]/50 p-4 text-sm text-[var(--text-mid)]">
            <p className="flex items-start gap-2">
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-mid)]" />
              {t('activation.paidPlanHint')}
            </p>
            <p className="mt-3 flex items-start gap-2">
              <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[var(--brand-mid)]" />
              {t('activation.freeTierHint')}
            </p>
          </div>

          {trialPlans.length > 0 && (
            <div className="space-y-2" aria-label={t('activation.planPickerLabel')}>
              {trialPlans.map((plan) => {
                const selected = plan.id === selectedTrialPlanId
                return (
                  <button
                    key={plan.id}
                    type="button"
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition ${
                      selected
                        ? 'border-[var(--brand-mid)] bg-[var(--brand-ultra)] text-[var(--text-strong)]'
                        : 'border-[var(--app-border)] bg-[var(--surface)] text-[var(--text-mid)] hover:border-[var(--brand-mid)]'
                    }`}
                    onClick={() => setSelectedTrialPlanId(plan.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {plan.display_name || plan.name || plan.code}
                      </span>
                      <span className="block text-xs text-[var(--text-muted)]">
                        {formatMonthlyPrice(plan.price_per_month)} {t('activation.afterTrial')}
                      </span>
                    </span>
                    {selected && (
                      <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--brand-mid)]" />
                    )}
                  </button>
                )
              })}
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={activatingFree || !selectedTrialPlan?.id}
            onClick={handleActivateFree}
          >
            {activatingFree ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Shield className="h-4 w-4" />
            )}
            {t('activation.activateTrial', {
              planName: selectedTrialPlan?.display_name || selectedTrialPlan?.name || '',
            })}
          </Button>
          <Button
            type="button"
            className="w-full gap-2"
            onClick={() => openBrowseUpgrade(dispatch)}
          >
            <CreditCard className="h-4 w-4" />
            {t('activation.comparePlans')}
          </Button>
          {pending && billing?.subscription?.planName && (
            <p className="text-center text-xs text-[var(--text-muted)]">
              {t('activation.pendingPlan', { planName: billing.subscription.planName })}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
