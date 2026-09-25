import { useEffect, useMemo, useState } from 'react'
import {
  useAddBillingPaymentMethodMutation,
  useGetBillingPaymentMethodsQuery,
  usePayFeaturedPlacementMutation,
  usePurchaseFeaturedPlacementMutation,
} from '../../services/api'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { CreditCard, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import { formatCurrency } from '../../utils/format'

type FeaturedPackage = {
  pricing_key: string
  display_name?: string | null
  amount?: number | string | null
  duration_days?: number | null
}

type PendingPlacement = {
  id: string
  pricing_key?: string | null
  amount_paid?: number | string | null
}

export function FeaturedPlacementPaymentDialog({
  open,
  onOpenChange,
  selectedPackage,
  pendingPlacement,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedPackage?: FeaturedPackage | null
  pendingPlacement?: PendingPlacement | null
  onSuccess: () => void
}) {
  const { data: methodsData, refetch } = useGetBillingPaymentMethodsQuery(undefined, {
    skip: !open,
  })
  const [addPaymentMethod, { isLoading: adding }] = useAddBillingPaymentMethodMutation()
  const [purchase, { isLoading: purchasing }] = usePurchaseFeaturedPlacementMutation()
  const [payPlacement, { isLoading: paying }] = usePayFeaturedPlacementMutation()
  const methods = useMemo(() => methodsData?.paymentMethods ?? [], [methodsData?.paymentMethods])
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null)
  const [showNewCard, setShowNewCard] = useState(false)
  const [cardNumber, setCardNumber] = useState('')
  const [expMonth, setExpMonth] = useState('')
  const [expYear, setExpYear] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    void refetch()
  }, [open, refetch])

  useEffect(() => {
    if (selectedMethodId || !methods.length) {
      if (!methods.length) setShowNewCard(true)
      return
    }
    setSelectedMethodId((methods.find((method) => method.is_default) ?? methods[0])?.id ?? null)
  }, [methods, selectedMethodId])

  async function ensurePaymentMethod() {
    if (selectedMethodId && !showNewCard) return selectedMethodId
    const digits = cardNumber.replace(/\D/g, '')
    if (digits.length < 13 || !expMonth || !expYear) {
      throw new Error('Enter a valid card number and expiry date')
    }
    const result = await addPaymentMethod({
      type: 'CARD',
      setAsDefault: true,
      card: { number: digits, expMonth, expYear },
    }).unwrap()
    return result.paymentMethod.id
  }

  async function submit() {
    setError(null)
    try {
      const paymentMethodId = await ensurePaymentMethod()
      const idempotencyKey =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? `featured:${crypto.randomUUID()}`
          : `featured:${Date.now()}`
      if (pendingPlacement?.id) {
        await payPlacement({ id: pendingPlacement.id, paymentMethodId, idempotencyKey }).unwrap()
      } else if (selectedPackage?.pricing_key) {
        await purchase({
          pricingKey: selectedPackage.pricing_key,
          paymentMethodId,
          idempotencyKey,
        }).unwrap()
      } else {
        throw new Error('Select a featured placement package')
      }
      onSuccess()
      onOpenChange(false)
    } catch (caught: unknown) {
      setError(
        (caught as { data?: { error?: { message?: string } } })?.data?.error?.message ||
          (caught as Error)?.message ||
          'Payment could not be processed'
      )
    }
  }

  const amount = Number(selectedPackage?.amount ?? pendingPlacement?.amount_paid ?? 0)
  const busy = adding || purchasing || paying

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-amber-500" />
            Pay for featured placement
          </DialogTitle>
          <DialogDescription>
            Payment creates a review request. Your placement becomes visible only after an admin
            approves it, and its term starts on approval.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--app-border)] p-3">
            <p className="font-medium">
              {selectedPackage?.display_name ||
                selectedPackage?.pricing_key ||
                pendingPlacement?.pricing_key}
            </p>
            <p className="text-sm text-[var(--text-muted)]">
              {selectedPackage?.duration_days ? `${selectedPackage.duration_days} days · ` : ''}
              {formatCurrency(amount)}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-lg bg-[var(--brand-ultra)] p-3 text-xs">
            <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--brand-mid)]" />
            Card details are tokenized by the configured payment provider.
          </div>

          {methods.length > 0 && !showNewCard ? (
            <div className="space-y-2">
              <Label>Payment method</Label>
              <select
                value={selectedMethodId || ''}
                onChange={(event) => setSelectedMethodId(event.target.value)}
                className="w-full rounded-md border border-[var(--app-border)] bg-[var(--surface)] px-3 py-2 text-sm"
              >
                {methods.map((method) => (
                  <option key={method.id} value={method.id}>
                    {method.brand || method.type} ending in {method.last4 || '----'}
                  </option>
                ))}
              </select>
              <Button type="button" variant="ghost" size="sm" onClick={() => setShowNewCard(true)}>
                Use a new card
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="featured-card">Card number</Label>
                <Input
                  id="featured-card"
                  inputMode="numeric"
                  value={cardNumber}
                  onChange={(event) => setCardNumber(event.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="featured-exp-month">Expiry month</Label>
                  <Input
                    id="featured-exp-month"
                    inputMode="numeric"
                    value={expMonth}
                    onChange={(event) => setExpMonth(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="featured-exp-year">Expiry year</Label>
                  <Input
                    id="featured-exp-year"
                    inputMode="numeric"
                    value={expYear}
                    onChange={(event) => setExpYear(event.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
          <Button className="w-full" disabled={busy} onClick={() => void submit()}>
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <CreditCard className="me-2 h-4 w-4" />
                Pay and submit for review
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
