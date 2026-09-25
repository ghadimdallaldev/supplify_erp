import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useGetFeaturedPlacementPackagesQuery,
  useGetMyFeaturedPlacementsQuery,
} from '../../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Skeleton } from '../ui/skeleton'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { formatCurrency } from '../../utils/format'
import { ensureNamespace } from '../../i18n'
import { FeaturedPlacementPaymentDialog } from './FeaturedPlacementPaymentDialog'

export function FeaturedPlacementPanel() {
  const { t } = useTranslation('suppliers')
  const { data: packagesData, isLoading: packagesLoading } = useGetFeaturedPlacementPackagesQuery()
  const { data: mineData, isLoading: mineLoading, refetch } = useGetMyFeaturedPlacementsQuery()
  const [paymentSelection, setPaymentSelection] = useState<{ pkg?: any; placement?: any } | null>(
    null
  )

  const packages = packagesData?.packages ?? []
  const placements = mineData?.placements ?? []
  const active = placements.find(
    (p: any) => p.status === 'active' && new Date(p.ends_at) > new Date()
  )
  const pendingPay = placements.find(
    (p: any) => p.status === 'pending' && p.payment_status === 'pending'
  )
  const pendingReview = placements.find(
    (p: any) =>
      p.status === 'pending' && (p.payment_status === 'paid' || p.payment_status === 'waived')
  )

  useEffect(() => {
    void ensureNamespace('suppliers')
  }, [])

  const handlePurchase = (pricingKey: string) => {
    setPaymentSelection({ pkg: packages.find((pkg: any) => pkg.pricing_key === pricingKey) })
  }

  const handlePayPending = () => {
    if (!pendingPay?.id) return
    setPaymentSelection({ placement: pendingPay })
  }

  if (packagesLoading || mineLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <Card data-testid="featured-placement-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-amber-500" />
            Featured supplier placement
          </CardTitle>
          <CardDescription>
            Appear at the top of restaurant supplier lists with a Featured badge. Separate from deal
            boosts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {active ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-900">Active placement</p>
              <p className="text-amber-800 mt-1">
                Ends {new Date(active.ends_at).toLocaleDateString()}
              </p>
            </div>
          ) : null}

          {!active && pendingReview ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
              <p className="font-medium text-amber-900">Awaiting admin approval</p>
              <p className="mt-1 text-amber-800">
                Payment was received. The placement period will start after approval.
              </p>
            </div>
          ) : null}

          {!active && pendingPay ? (
            <div className="rounded-lg border border-[var(--app-border)] p-3 text-sm flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">Payment required</p>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Complete card payment to submit this placement for admin review.
                </p>
              </div>
              <Button size="sm" onClick={handlePayPending}>
                Pay now
              </Button>
            </div>
          ) : null}

          {packages.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No packages available right now.</p>
          ) : (
            <ul className="space-y-2">
              {packages.map((pkg: any) => (
                <li
                  key={pkg.pricing_key}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium text-sm">{pkg.display_name || pkg.pricing_key}</p>
                    <p className="text-xs text-[var(--text-muted)]">
                      {pkg.duration_days || 7} days · {formatCurrency(Number(pkg.amount || 0))}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={Boolean(active || pendingPay || pendingReview)}
                    onClick={() => handlePurchase(pkg.pricing_key)}
                  >
                    {active
                      ? 'Active'
                      : pendingReview
                        ? 'Awaiting approval'
                        : pendingPay
                          ? 'Payment pending'
                          : 'Get featured'}
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {placements.length > 0 && (
            <div className="pt-2 border-t">
              <p className="text-xs font-medium text-[var(--text-muted)] mb-2">Recent placements</p>
              <ul className="space-y-1">
                {placements.slice(0, 3).map((p: any) => (
                  <li key={p.id} className="flex items-center gap-2 text-xs">
                    <Badge variant="outline">{p.status}</Badge>
                    <span>
                      {new Date(p.starts_at).toLocaleDateString()} –{' '}
                      {new Date(p.ends_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>
      <FeaturedPlacementPaymentDialog
        open={Boolean(paymentSelection)}
        onOpenChange={(open) => !open && setPaymentSelection(null)}
        selectedPackage={paymentSelection?.pkg}
        pendingPlacement={paymentSelection?.placement}
        onSuccess={() => {
          toast.success('Payment received — awaiting admin approval')
          void refetch()
        }}
      />
    </>
  )
}
