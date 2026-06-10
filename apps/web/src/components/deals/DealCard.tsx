import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  useGetEntitlementsQuery,
  useRecordDealInteractionMutation,
  useUseDealCouponMutation,
  useMessageFromDealMutation,
} from '../../services/api'
import {
  Building2,
  Tag,
  Megaphone,
  Copy,
  MessageCircle,
  ShoppingCart,
  Eye,
  Lock,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { formatPrice } from '../../utils/format'
import { useAppDispatch } from '../../hooks/redux'
import { useImpersonation } from '../../hooks/useImpersonation'
import { getDealRedeemGate } from '../../lib/planLimits'
import { LIMIT_UPGRADE_COPY } from '../../lib/upgradeCopy'
import { openBrowseUpgrade } from '../../lib/openBrowseUpgrade'
import { cn } from '../../lib/utils'
import { cardActionBtnClass, cardShellClass } from '../ui/card-layout'
import {
  COUPON_COPIED_TOAST,
  COUPON_LINKED_HELPER,
  formatDealTypeLabel,
  getCtaLabel,
} from '../../lib/dealDisplayLabels'

export type DealRecord = Record<string, unknown>

function formatDiscount(deal: DealRecord) {
  const type = String(deal.type || '')
  const val = deal.discount_value
  if (val == null) return formatDealTypeLabel(type)
  if (type === 'percentage_discount' || type === 'percentage_off') return `${val}% off`
  if (type === 'fixed_discount' || type === 'fixed_off') return `${formatPrice(Number(val))} off`
  if (type === 'free_shipping') return 'Free shipping'
  return formatDealTypeLabel(type)
}

function formatValidUntil(deal: DealRecord) {
  if (!deal.ends_at) return 'No expiry'
  return new Date(String(deal.ends_at)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function ctaLabel(deal: DealRecord) {
  return getCtaLabel(deal.cta_type, 'restaurant')
}

function CtaIcon({ cta }: { cta: string }) {
  const cls = 'h-4 w-4 mr-2'
  switch (cta) {
    case 'use_coupon':
      return <Copy className={cls} />
    case 'message_supplier':
      return <MessageCircle className={cls} />
    case 'view_products':
      return <Eye className={cls} />
    default:
      return <ShoppingCart className={cls} />
  }
}

function DealBadges({ deal, isSponsored }: { deal: DealRecord; isSponsored: boolean }) {
  return (
    <div className="flex flex-row flex-wrap items-center justify-end gap-1 shrink-0 max-w-full">
      {isSponsored ? (
        <Badge variant="secondary" className="gap-1 text-[10px]">
          <Megaphone className="h-3 w-3" />
          Sponsored
        </Badge>
      ) : null}
      {deal.is_featured ? <Badge className="text-[10px]">Featured</Badge> : null}
    </div>
  )
}

function ctaNeedsRedeem(deal: DealRecord) {
  const cta = deal.cta_type || 'order_now'
  return cta === 'use_coupon' || cta === 'order_now'
}

export function DealCard({
  deal,
  canRedeem: canRedeemProp,
}: {
  deal: DealRecord
  canRedeem?: boolean
}) {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { isEffectiveRestaurant, shouldLoadTenantEntitlements } = useImpersonation()
  const cardRef = useRef<HTMLDivElement>(null)
  const viewTracked = useRef(false)
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !shouldLoadTenantEntitlements || !isEffectiveRestaurant,
  })
  const dealRedeemGate = getDealRedeemGate(entitlementsData?.entitlements)
  const canRedeem = canRedeemProp ?? dealRedeemGate.canRedeem
  const redeemCopy = LIMIT_UPGRADE_COPY.deal_redemptions_per_day
  const [recordInteraction] = useRecordDealInteractionMutation()
  const [redeemCoupon] = useUseDealCouponMutation()
  const [messageFromDeal, { isLoading: messaging }] = useMessageFromDealMutation()

  const dealId = String(deal.id)
  const supplierId = String(deal.supplier_id || '')
  const isSponsored = Boolean(deal.is_sponsored)

  const trackInteraction = async (interactionType: 'view' | 'click') => {
    try {
      await recordInteraction({ id: dealId, interactionType }).unwrap()
    } catch {
      /* non-blocking analytics */
    }
  }

  const trackClick = () => trackInteraction('click')

  useEffect(() => {
    viewTracked.current = false
    if (!isEffectiveRestaurant) return
    const el = cardRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0]
        if (!entry?.isIntersecting || viewTracked.current) return
        viewTracked.current = true
        recordInteraction({ id: dealId, interactionType: 'view' })
          .unwrap()
          .catch(() => {})
        observer.disconnect()
      },
      { threshold: 0.35, rootMargin: '0px' }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [dealId, isEffectiveRestaurant, recordInteraction])

  const handleCta = async () => {
    await trackClick()
    const cta = deal.cta_type || 'order_now'

    if (!canRedeem && ctaNeedsRedeem(deal)) {
      openBrowseUpgrade(dispatch, {
        currentPlan: dealRedeemGate.planName ?? 'Free',
        upgradeUrl: '/app/settings?tab=subscription',
      })
      toast(dealRedeemGate.message || redeemCopy.value, { icon: '🔒' })
      return
    }

    if (cta === 'use_coupon') {
      try {
        const result = await redeemCoupon(dealId).unwrap()
        await navigator.clipboard.writeText(result.couponCode)
        toast.success(COUPON_COPIED_TOAST)
        navigate(
          `/app/cart?coupon=${encodeURIComponent(result.couponCode)}&supplierId=${supplierId}`
        )
      } catch (e: unknown) {
        const err = e as { data?: { error?: { message?: string } } }
        toast.error(err?.data?.error?.message || 'Could not retrieve coupon')
      }
      return
    }

    if (cta === 'message_supplier') {
      try {
        const result = await messageFromDeal(dealId).unwrap()
        navigate(`/app/chat?conversation=${result.conversation.id}`)
      } catch (e: unknown) {
        const err = e as { data?: { error?: { message?: string } } }
        toast.error(err?.data?.error?.message || 'Could not start conversation')
      }
      return
    }

    if (cta === 'view_products') {
      navigate(`/app/products?supplierId=${supplierId}&dealId=${dealId}`)
      return
    }

    navigate(`/app/products?supplierId=${supplierId}&dealId=${dealId}&orderDeal=1`)
  }

  return (
    <div ref={cardRef} className="h-full">
      <Card
        className={`${cardShellClass} h-full ${isSponsored ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]/20' : ''}`}
      >
        {deal.image_url ? (
          <img
            src={String(deal.image_url)}
            alt={String(deal.name)}
            className="w-full h-36 object-cover"
          />
        ) : (
          <DealBannerPlaceholderInner />
        )}
        <CardHeader className="pb-2">
          <div className="flex flex-col gap-2 min-w-0">
            <div className="flex items-start justify-between gap-2 min-w-0">
              <CardTitle className="text-base min-w-0 flex-1">
                <span className="flex items-center gap-2 min-w-0">
                  <Tag className="h-4 w-4 shrink-0 text-[var(--brand)]" />
                  <span className="truncate">{String(deal.name)}</span>
                </span>
              </CardTitle>
              <DealBadges deal={deal} isSponsored={isSponsored} />
            </div>
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 min-w-0">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{String(deal.supplier_name || 'Supplier')}</span>
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="font-semibold text-[var(--brand)]">{formatDiscount(deal)}</p>
          {deal.min_order_amount != null && Number(deal.min_order_amount) > 0 ? (
            <p className="text-xs text-[var(--text-muted)]">
              Min order: {formatPrice(Number(deal.min_order_amount))}
            </p>
          ) : null}
          {deal.coupon_code ? (
            <div className="space-y-1">
              <p className="text-xs font-mono bg-[var(--app-muted)] px-2 py-1 rounded inline-block">
                {canRedeem ? (
                  <>Code: {String(deal.coupon_code)}</>
                ) : (
                  <>Apply limit reached — upgrade for more redemptions</>
                )}
              </p>
              <p className="text-xs text-[var(--text-muted)]">{COUPON_LINKED_HELPER}</p>
            </div>
          ) : null}
          {deal.description ? (
            <p className="text-[var(--text-muted)] line-clamp-2">{String(deal.description)}</p>
          ) : null}
          <p className="text-xs text-[var(--text-muted)]">Valid until {formatValidUntil(deal)}</p>
          <Button
            size="sm"
            className={cn('w-full', cardActionBtnClass())}
            onClick={handleCta}
            disabled={messaging}
          >
            {!canRedeem && ctaNeedsRedeem(deal) ? (
              <Lock className="h-4 w-4 mr-2" />
            ) : (
              <CtaIcon cta={String(deal.cta_type || 'order_now')} />
            )}
            {!canRedeem && ctaNeedsRedeem(deal) ? 'Daily limit reached' : ctaLabel(deal)}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function DealBannerPlaceholderInner() {
  return (
    <div className="w-full h-24 bg-gradient-to-br from-[var(--brand)]/15 to-[var(--app-muted)] flex items-center justify-center">
      <Tag className="h-8 w-8 text-[var(--brand)]/40" />
    </div>
  )
}
