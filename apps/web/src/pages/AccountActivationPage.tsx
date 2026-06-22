import { CreditCard, Loader2, Lock, Shield } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader } from '../components/ui/card'
import { PageHeader } from '../components/ui/page-header'
import { useGetBillingStatusQuery, useGetSubscriptionPlansQuery } from '../services/api'
import { useAppDispatch, useAppSelector } from '../hooks/redux'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { activateFreePlanFromPlans } from '../lib/activateFreePlan'
import { canLeaveActivationPage } from '../lib/refetchAppSession'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ensureNamespace } from '../i18n'

export function AccountActivationPage() {
  const { t } = useTranslation('onboarding')
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { user } = useAppSelector((state) => state.auth)
  const { data: billing, isLoading } = useGetBillingStatusQuery()
  const { data: plansData } = useGetSubscriptionPlansQuery()
  const [activatingFree, setActivatingFree] = useState(false)

  const pending = billing?.access?.pendingActivation && billing.access.isLocked
  const isSupplier = user?.role === 'SUPPLIER'

  useEffect(() => {
    void ensureNamespace('onboarding')
  }, [])

  useEffect(() => {
    if (isLoading || !billing?.access) return
    if (canLeaveActivationPage(billing.access)) {
      navigate('/app', { replace: true })
    }
  }, [billing, isLoading, navigate])

  const handleActivateFree = async () => {
    setActivatingFree(true)
    const result = await activateFreePlanFromPlans(dispatch, plansData?.plans)
    setActivatingFree(false)
    if (result.ok) {
      toast.success(t('activation.freePlanActive'))
      navigate('/app', { replace: true })
      return
    }
    toast.error(result.message)
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center p-6">
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
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={activatingFree}
            onClick={handleActivateFree}
          >
            {activatingFree ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Shield className="h-4 w-4" />
            )}
            {t('activation.activateFree')}
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
