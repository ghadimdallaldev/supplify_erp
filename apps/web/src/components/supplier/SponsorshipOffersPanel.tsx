import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  useGetRestaurantSponsorshipOffersQuery,
  useAcceptSponsorshipOfferMutation,
  useDeclineSponsorshipOfferMutation,
} from '../../services/api/endpoints/growth'
import { useGetSubscriptionPlansQuery } from '../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Skeleton } from '../ui/skeleton'
import { Gift } from 'lucide-react'

export function SponsorshipOffersPanel() {
  const { data, isLoading, isError, refetch } = useGetRestaurantSponsorshipOffersQuery()
  const [acceptOffer, { isLoading: accepting }] = useAcceptSponsorshipOfferMutation()
  const [declineOffer, { isLoading: declining }] = useDeclineSponsorshipOfferMutation()
  const { data: plansData } = useGetSubscriptionPlansQuery()
  const [planByOffer, setPlanByOffer] = useState<Record<string, string>>({})

  const offers = (data?.offers ?? []).filter((o) =>
    ['offered', 'accepted', 'payment_pending', 'scheduled', 'active'].includes(o.status)
  )
  const rawPlans = Array.isArray(plansData)
    ? plansData
    : (plansData as { plans?: unknown[] })?.plans || []
  const restaurantPlans = (
    rawPlans as Array<{
      id: string
      code?: string
      name: string
      is_active?: boolean
      price_per_month?: number
      tenant_type?: string
    }>
  ).filter(
    (p) =>
      (p.tenant_type == null || p.tenant_type === 'RESTAURANT') &&
      p.is_active !== false &&
      String(p.code || '').toLowerCase() !== 'free' &&
      Number(p.price_per_month) > 0
  )

  useEffect(() => {
    if (!offers.length || !restaurantPlans.length) return
    setPlanByOffer((prev) => {
      const next = { ...prev }
      for (const o of offers) {
        if (!next[o.id]) {
          next[o.id] = o.selected_plan_id || restaurantPlans[0]?.id
        }
      }
      return next
    })
  }, [offers, restaurantPlans])

  if (isLoading) {
    return (
      <Skeleton className="h-24 w-full rounded-xl mb-4" data-testid="sponsorship-offers-loading" />
    )
  }
  if (isError) {
    return (
      <div className="rounded-xl border border-[var(--app-border)] p-4 mb-4 text-center text-sm">
        <p className="text-[var(--text-muted)]">Could not load sponsorship offers.</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    )
  }
  if (offers.length === 0) return null

  return (
    <Card className="mb-6" data-testid="sponsorship-offers-panel">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Gift className="h-4 w-4 text-[var(--brand)]" />
          Sponsorship offers
        </CardTitle>
        <CardDescription>
          A supplier can pay for your first month after your free trial. After that month, you pay
          for your subscription.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {offers.map((offer) => {
          const selectedPlanId = planByOffer[offer.id]
          const selectedPlan = restaurantPlans.find((p: { id: string }) => p.id === selectedPlanId)
          const monthly = Number(selectedPlan?.price_per_month ?? offer.price_per_month ?? 0)
          return (
            <div
              key={offer.id}
              className="rounded-lg border border-[var(--app-border)] p-3 space-y-3"
              data-testid={`sponsorship-offer-${offer.id}`}
            >
              <div>
                <p className="font-medium">{offer.supplier_name || 'Supplier'}</p>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Status: <span className="font-medium">{offer.status}</span>
                  {offer.offer_expires_at && offer.status === 'offered'
                    ? ` · Offer expires ${new Date(offer.offer_expires_at).toLocaleDateString()}`
                    : null}
                </p>
              </div>
              {offer.status === 'offered' && (
                <>
                  <div>
                    <label className="text-xs font-medium" htmlFor={`plan-${offer.id}`}>
                      Choose your ongoing plan (monthly)
                    </label>
                    <select
                      id={`plan-${offer.id}`}
                      className="mt-1 w-full rounded-md border border-[var(--app-border)] bg-transparent px-3 py-2 text-sm"
                      value={selectedPlanId || ''}
                      onChange={(e) =>
                        setPlanByOffer((prev) => ({ ...prev, [offer.id]: e.target.value }))
                      }
                    >
                      {restaurantPlans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} — ${Number(p.price_per_month).toFixed(2)}/mo
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-sm text-[var(--text)]">
                    {offer.supplier_name || 'Your supplier'} will pay for your first month on the{' '}
                    {selectedPlan?.name || 'selected'} plan after your free trial. After the
                    sponsored month ends, your subscription will continue at ${monthly.toFixed(2)}{' '}
                    per month unless you change or cancel your plan. Referral discount (if any)
                    applies to your first self-funded billing cycle.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={!selectedPlanId || accepting || declining}
                      onClick={async () => {
                        try {
                          await acceptOffer({ id: offer.id, planId: selectedPlanId! }).unwrap()
                          toast.success(
                            'Sponsorship accepted — supplier will be charged for one month'
                          )
                        } catch (err: unknown) {
                          const msg =
                            (err as { data?: { error?: { message?: string } } })?.data?.error
                              ?.message || 'Could not accept sponsorship'
                          toast.error(msg)
                        }
                      }}
                    >
                      Accept sponsorship
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={accepting || declining}
                      onClick={async () => {
                        try {
                          await declineOffer(offer.id).unwrap()
                          toast.success('Sponsorship declined')
                        } catch {
                          toast.error('Could not decline sponsorship')
                        }
                      }}
                    >
                      Decline
                    </Button>
                  </div>
                </>
              )}
              {offer.status !== 'offered' && (
                <p className="text-sm text-[var(--text-muted)]">
                  {offer.status === 'payment_pending' &&
                    'Waiting for the supplier to pay the one-time sponsorship invoice.'}
                  {offer.status === 'scheduled' &&
                    'Supplier paid. Your sponsored month starts when your free trial ends.'}
                  {offer.status === 'active' &&
                    `Sponsored month is active until ${
                      offer.period_end
                        ? new Date(offer.period_end).toLocaleDateString()
                        : 'period end'
                    }.`}
                  {offer.status === 'accepted' && 'Accepted — preparing supplier invoice.'}
                </p>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
