import { useEffect, useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../../hooks/redux'
import { closePaymentModal } from '../../features/billing/billingSlice'
import {
  useGetBillingStatusQuery,
  useGetBillingPaymentMethodsQuery,
  useAddBillingPaymentMethodMutation,
  useBillingCheckoutMutation,
  useBillingPayNowMutation,
  useSetBillingAutoRenewMutation,
} from '../../services/api'
import { refetchAppSession } from '../../lib/refetchAppSession'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'
import { CreditCard, Lock, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type BillingCycle = 'MONTHLY' | 'YEARLY'

function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export function PaymentModal() {
  const dispatch = useAppDispatch()
  const { paymentModalOpen, paymentModalMode, paymentModalPlan } = useAppSelector((s) => s.billing)

  const { data: billingStatus, refetch: refetchStatus } = useGetBillingStatusQuery(undefined, {
    skip: !paymentModalOpen,
  })
  const { data: methodsData, refetch: refetchMethods } = useGetBillingPaymentMethodsQuery(
    undefined,
    { skip: !paymentModalOpen }
  )

  const [addPaymentMethod, { isLoading: addingMethod }] = useAddBillingPaymentMethodMutation()
  const [checkout, { isLoading: checkingOut }] = useBillingCheckoutMutation()
  const [payNow, { isLoading: paying }] = useBillingPayNowMutation()
  const [setAutoRenew] = useSetBillingAutoRenewMutation()

  const [billingCycle, setBillingCycle] = useState<BillingCycle>('MONTHLY')
  const [autoRenew, setAutoRenewLocal] = useState(true)
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null)
  const [showNewCard, setShowNewCard] = useState(false)
  const [cardNumber, setCardNumber] = useState('')
  const [expMonth, setExpMonth] = useState('')
  const [expYear, setExpYear] = useState('')
  const [cardName, setCardName] = useState('')
  const [error, setError] = useState<string | null>(null)

  const methods = methodsData?.paymentMethods ?? []
  const isPayOverdue = paymentModalMode === 'pay_overdue'
  const plan = paymentModalPlan

  const monthlyPrice = plan?.priceMonthly ?? 0
  const yearlyPrice = plan?.priceYearly ?? monthlyPrice * 12
  const yearlySavings = monthlyPrice > 0 ? Math.max(0, monthlyPrice * 12 - yearlyPrice) : 0

  const chargeAmount = useMemo(() => {
    if (isPayOverdue) return billingStatus?.amountDue ?? 0
    return billingCycle === 'YEARLY' ? yearlyPrice : monthlyPrice
  }, [isPayOverdue, billingStatus?.amountDue, billingCycle, yearlyPrice, monthlyPrice])

  const isFreeCheckout =
    !isPayOverdue && ((plan?.planCode || '').toLowerCase() === 'free' || chargeAmount <= 0)

  useEffect(() => {
    if (!paymentModalOpen) return
    setError(null)
    setBillingCycle('MONTHLY')
    setAutoRenewLocal(billingStatus?.access?.autoRenew !== false)
    const def = methods.find((m) => m.is_default) ?? methods[0]
    setSelectedMethodId(def?.id ?? null)
    setShowNewCard(methods.length === 0)
    refetchStatus()
    refetchMethods()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentModalOpen])

  useEffect(() => {
    if (methods.length > 0 && !selectedMethodId) {
      const def = methods.find((m) => m.is_default) ?? methods[0]
      setSelectedMethodId(def?.id ?? null)
    }
  }, [methods, selectedMethodId])

  const handleClose = () => {
    dispatch(closePaymentModal())
    setCardNumber('')
    setExpMonth('')
    setExpYear('')
    setCardName('')
    setError(null)
  }

  const ensurePaymentMethod = async (): Promise<string> => {
    if (selectedMethodId && !showNewCard) return selectedMethodId

    const digits = cardNumber.replace(/\D/g, '')
    if (digits.length < 13) {
      throw new Error('Enter a valid card number')
    }
    const res = await addPaymentMethod({
      type: 'CARD',
      setAsDefault: true,
      card: {
        number: digits,
        expMonth,
        expYear,
      },
    }).unwrap()
    return res.paymentMethod.id
  }

  const handleSubmit = async () => {
    setError(null)
    try {
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `pay_${Date.now()}`

      if (isPayOverdue) {
        const paymentMethodId = await ensurePaymentMethod()
        await setAutoRenew({ autoRenew }).unwrap()
        await payNow({ paymentMethodId, idempotencyKey }).unwrap()
        toast.success('Payment received. Your account has been restored.')
      } else {
        if (!plan?.planId) {
          setError('Plan not selected')
          return
        }
        if (!isFreeCheckout) {
          const paymentMethodId = await ensurePaymentMethod()
          await setAutoRenew({ autoRenew }).unwrap()
          await checkout({
            planId: plan.planId,
            billingCycle,
            paymentMethodId,
            idempotencyKey,
          }).unwrap()
        } else {
          await checkout({
            planId: plan.planId,
            billingCycle,
            idempotencyKey,
          }).unwrap()
        }
        toast.success(
          isFreeCheckout ? 'Your free plan is active.' : `You're now on ${plan.planName}`
        )
      }

      await refetchAppSession(dispatch)
      handleClose()
    } catch (e: unknown) {
      const msg =
        (e as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        (e as Error)?.message ||
        'Payment failed. Check your card and try again.'
      setError(msg)
    }
  }

  const busy = addingMethod || checkingOut || paying

  return (
    <Dialog open={paymentModalOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[var(--brand-mid)]" />
            {isPayOverdue ? 'Pay overdue balance' : `Subscribe to ${plan?.planName ?? 'plan'}`}
          </DialogTitle>
          <DialogDescription>
            Secure checkout. Card details are tokenized by our payment provider — we never store
            full card numbers or CVV.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span>
            Encrypted in transit (TLS). PCI-aligned: only the last 4 digits are kept on file.
          </span>
        </div>

        {billingStatus?.access?.inGracePeriod && (
          <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Payment overdue. Pay within{' '}
              <strong>{billingStatus.access.daysUntilLock ?? 0} day(s)</strong> to avoid account
              lock ({billingStatus.gracePeriodDays}-day notice period).
            </span>
          </div>
        )}

        {!isPayOverdue && plan && !isFreeCheckout && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setBillingCycle('MONTHLY')}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  billingCycle === 'MONTHLY'
                    ? 'border-[var(--brand-mid)] bg-[var(--brand-ultra)] ring-1 ring-[var(--brand-mid)]'
                    : 'border-[var(--app-border)] hover:bg-[var(--bg)]'
                }`}
              >
                <p className="text-xs font-medium text-[var(--text-muted)]">Monthly</p>
                <p className="text-lg font-bold">{formatMoney(monthlyPrice)}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Billed every month</p>
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('YEARLY')}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  billingCycle === 'YEARLY'
                    ? 'border-[var(--brand-mid)] bg-[var(--brand-ultra)] ring-1 ring-[var(--brand-mid)]'
                    : 'border-[var(--app-border)] hover:bg-[var(--bg)]'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <p className="text-xs font-medium text-[var(--text-muted)]">Yearly</p>
                  {yearlySavings > 0 && (
                    <Badge
                      variant="outline"
                      className="text-[10px] border-emerald-300 text-emerald-700"
                    >
                      Save {formatMoney(yearlySavings)}
                    </Badge>
                  )}
                </div>
                <p className="text-lg font-bold">{formatMoney(yearlyPrice)}</p>
                <p className="text-[10px] text-[var(--text-muted)]">Auto-renews annually</p>
              </button>
            </div>
          </div>
        )}

        {isPayOverdue && billingStatus && billingStatus.amountDue > 0 && (
          <div className="rounded-lg border border-[var(--app-border)] bg-[var(--bg)] p-3">
            <p className="text-sm text-[var(--text-muted)]">Amount due</p>
            <p className="text-2xl font-bold text-[var(--text)]">
              {formatMoney(billingStatus.amountDue)}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-medium">Payment method</p>
          {methods.length > 0 && (
            <div className="space-y-2">
              {methods.map((m) => (
                <label
                  key={m.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 ${
                    selectedMethodId === m.id && !showNewCard
                      ? 'border-[var(--brand-mid)] bg-[var(--brand-ultra)]'
                      : 'border-[var(--app-border)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="pm"
                    checked={selectedMethodId === m.id && !showNewCard}
                    onChange={() => {
                      setSelectedMethodId(m.id)
                      setShowNewCard(false)
                    }}
                  />
                  <CreditCard className="h-4 w-4 text-[var(--text-muted)]" />
                  <span className="text-sm capitalize">
                    {m.brand || m.type} •••• {m.last4}
                    {m.is_default && (
                      <span className="ml-2 text-xs text-[var(--text-muted)]">(default)</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          )}
          <button
            type="button"
            className="text-sm font-medium text-[var(--brand-mid)] underline hover:no-underline"
            onClick={() => setShowNewCard((v) => !v)}
          >
            {showNewCard ? 'Use saved card' : '+ Add new card'}
          </button>
          {showNewCard && (
            <div className="space-y-3 rounded-lg border border-[var(--app-border)] p-3">
              <div>
                <Label htmlFor="cardName">Name on card</Label>
                <Input
                  id="cardName"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Jane Doe"
                  autoComplete="cc-name"
                />
              </div>
              <div>
                <Label htmlFor="cardNumber">Card number</Label>
                <Input
                  id="cardNumber"
                  value={cardNumber}
                  onChange={(e) => setCardNumber(e.target.value.replace(/[^\d\s]/g, ''))}
                  placeholder="4242 4242 4242 4242"
                  inputMode="numeric"
                  autoComplete="cc-number"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="expMonth">Expiry month</Label>
                  <Input
                    id="expMonth"
                    value={expMonth}
                    onChange={(e) => setExpMonth(e.target.value)}
                    placeholder="MM"
                    maxLength={2}
                    autoComplete="cc-exp-month"
                  />
                </div>
                <div>
                  <Label htmlFor="expYear">Expiry year</Label>
                  <Input
                    id="expYear"
                    value={expYear}
                    onChange={(e) => setExpYear(e.target.value)}
                    placeholder="YYYY"
                    maxLength={4}
                    autoComplete="cc-exp-year"
                  />
                </div>
              </div>
              <p className="text-[10px] text-[var(--text-muted)] flex items-center gap-1">
                <Lock className="h-3 w-3" />
                CVV is not stored. It is sent only to the payment gateway during authorization.
              </p>
            </div>
          )}
        </div>

        {!isPayOverdue && (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoRenew}
              onChange={(e) => setAutoRenewLocal(e.target.checked)}
              className="mt-1"
            />
            <span>
              Enable automatic renewal. Your saved payment method will be charged each{' '}
              {billingCycle === 'YEARLY' ? 'year' : 'month'} until you cancel.
            </span>
          </label>
        )}

        {error && (
          <p className="text-sm text-red-600 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <Button type="button" disabled={busy} onClick={handleSubmit} className="w-full">
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing…
              </>
            ) : isPayOverdue ? (
              `Pay ${formatMoney(chargeAmount)} now`
            ) : isFreeCheckout ? (
              'Activate free plan'
            ) : (
              `Pay ${formatMoney(chargeAmount)} & activate`
            )}
          </Button>
          <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
