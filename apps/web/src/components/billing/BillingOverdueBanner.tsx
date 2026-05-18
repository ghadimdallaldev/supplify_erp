import { AlertTriangle, Lock } from 'lucide-react'
import { Button } from '../ui/button'
import { useGetBillingStatusQuery } from '../../services/api'
import { useAppDispatch } from '../../hooks/redux'
import { openOverduePayment } from '../../lib/openPaymentModal'

export function BillingOverdueBanner() {
  const dispatch = useAppDispatch()
  const { data: billing } = useGetBillingStatusQuery()

  if (!billing?.access) return null
  const { isLocked, inGracePeriod, isPastDue, daysUntilLock, pendingActivation } = billing.access

  if (!isPastDue && !isLocked) return null

  if (isLocked && pendingActivation) {
    return (
      <div className="mx-6 mt-4 rounded-lg border border-[var(--brand-light)] bg-[var(--brand-pale)] px-4 py-3 text-sm text-[var(--text)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Lock className="h-5 w-5 shrink-0 text-[var(--brand-mid)]" aria-hidden />
            <div>
              <p className="font-semibold">Account pending activation</p>
              <p className="mt-0.5 text-[var(--text-muted)]">
                Complete payment for a plan or ask an administrator to activate your workspace.
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
            Activate account
          </Button>
        </div>
      </div>
    )
  }

  if (isLocked) {
    return (
      <div className="mx-6 mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <Lock className="h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Account locked — payment required</p>
              <p className="mt-0.5 text-red-900/90">
                Your workspace is suspended after the {billing.gracePeriodDays}-day notice period.
                Pay your balance to restore full access.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="destructive"
            className="shrink-0"
            onClick={() => openOverduePayment(dispatch)}
          >
            Pay now
          </Button>
        </div>
      </div>
    )
  }

  if (inGracePeriod) {
    return (
      <div className="mx-6 mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold">Subscription payment overdue</p>
              <p className="mt-0.5 text-amber-900/90">
                Pay within <strong>{daysUntilLock ?? 0} day(s)</strong> to avoid your account being
                locked. Automatic renewal failed or an invoice is unpaid.
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="shrink-0 bg-amber-700 hover:bg-amber-800 text-white"
            onClick={() => openOverduePayment(dispatch)}
          >
            Update payment
          </Button>
        </div>
      </div>
    )
  }

  return null
}
