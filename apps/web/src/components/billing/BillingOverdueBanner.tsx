import { AlertTriangle, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { useGetBillingStatusQuery } from '../../services/api'
import { useAppDispatch } from '../../hooks/redux'
import { openOverduePayment } from '../../lib/openPaymentModal'
import { openBrowseUpgrade } from '../../lib/openBrowseUpgrade'

export function BillingOverdueBanner() {
  const { t } = useTranslation('common')
  const dispatch = useAppDispatch()
  const { data: billing } = useGetBillingStatusQuery()

  if (!billing?.access) return null
  const {
    isLocked,
    inGracePeriod,
    isPastDue,
    daysUntilLock,
    pendingActivation,
    freeSandboxExpired,
    lockReason,
  } = billing.access

  if (!isPastDue && !isLocked) return null

  if (isLocked && (freeSandboxExpired || lockReason === 'free_sandbox_expired')) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Lock className="h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{t('billingOverdue.freeTrial.title')}</p>
              <p className="mt-0.5 text-amber-900/90">
                {t('billingOverdue.freeTrial.description')}
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="shrink-0"
            onClick={() => openBrowseUpgrade(dispatch, { upgradeUrl: '/app/settings?tab=plan' })}
          >
            {t('billingOverdue.freeTrial.cta')}
          </Button>
        </div>
      </div>
    )
  }

  if (isLocked && pendingActivation) {
    return (
      <div className="rounded-lg border border-[var(--brand-light)] bg-[var(--brand-pale)] px-4 py-3 text-sm text-[var(--text)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Lock className="h-5 w-5 shrink-0 text-[var(--brand-mid)]" aria-hidden />
            <div>
              <p className="font-semibold">{t('billingOverdue.pendingActivation.title')}</p>
              <p className="mt-0.5 text-[var(--text-muted)]">
                {t('billingOverdue.pendingActivation.description')}
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="shrink-0"
            onClick={() => {
              window.location.href = '/app/activate'
            }}
          >
            {t('billingOverdue.pendingActivation.cta')}
          </Button>
        </div>
      </div>
    )
  }

  if (isLocked) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Lock className="h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{t('billingOverdue.locked.title')}</p>
              <p className="mt-0.5 text-red-900/90">
                {t('billingOverdue.locked.description', {
                  days: billing.gracePeriodDays ?? 0,
                })}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="destructive"
            className="shrink-0"
            onClick={() => openOverduePayment(dispatch)}
          >
            {t('billingOverdue.locked.cta')}
          </Button>
        </div>
      </div>
    )
  }

  if (inGracePeriod) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">{t('billingOverdue.grace.title')}</p>
              <p className="mt-0.5 text-amber-900/90">
                {t('billingOverdue.grace.description', {
                  days: daysUntilLock ?? 0,
                })}
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="shrink-0 bg-amber-700 hover:bg-amber-800 text-white"
            onClick={() => openOverduePayment(dispatch)}
          >
            {t('billingOverdue.grace.cta')}
          </Button>
        </div>
      </div>
    )
  }

  return null
}
