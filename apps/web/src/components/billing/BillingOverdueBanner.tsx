import { AlertTriangle, Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { InfoBanner } from '../ui/info-banner'
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
      <InfoBanner
        tone="amber"
        icon={Lock}
        title={t('billingOverdue.freeTrial.title')}
        description={t('billingOverdue.freeTrial.description')}
        action={
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            onClick={() => openBrowseUpgrade(dispatch, { upgradeUrl: '/app/settings?tab=plan' })}
          >
            {t('billingOverdue.freeTrial.cta')}
          </Button>
        }
      />
    )
  }

  if (isLocked && pendingActivation) {
    return (
      <InfoBanner
        tone="neutral"
        icon={Lock}
        title={t('billingOverdue.pendingActivation.title')}
        description={t('billingOverdue.pendingActivation.description')}
        action={
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            onClick={() => {
              window.location.href = '/app/activate'
            }}
          >
            {t('billingOverdue.pendingActivation.cta')}
          </Button>
        }
      />
    )
  }

  if (isLocked) {
    return (
      <InfoBanner
        tone="red"
        icon={Lock}
        title={t('billingOverdue.locked.title')}
        description={t('billingOverdue.locked.description', {
          days: billing.gracePeriodDays ?? 0,
        })}
        action={
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="shrink-0"
            onClick={() => openOverduePayment(dispatch)}
          >
            {t('billingOverdue.locked.cta')}
          </Button>
        }
      />
    )
  }

  if (inGracePeriod) {
    return (
      <InfoBanner
        tone="amber"
        icon={AlertTriangle}
        title={t('billingOverdue.grace.title')}
        description={t('billingOverdue.grace.description', {
          days: daysUntilLock ?? 0,
        })}
        action={
          <Button
            type="button"
            size="sm"
            className="shrink-0 bg-amber-700 text-white hover:bg-amber-800"
            onClick={() => openOverduePayment(dispatch)}
          >
            {t('billingOverdue.grace.cta')}
          </Button>
        }
      />
    )
  }

  return null
}
