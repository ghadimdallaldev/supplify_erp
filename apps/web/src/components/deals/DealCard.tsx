import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import {
  useRecordDealInteractionMutation,
  useUseDealCouponMutation,
  useMessageFromDealMutation,
} from '../../services/api'
import { Building2, Tag, Megaphone, Copy, MessageCircle, ShoppingCart, Eye } from 'lucide-react'
import toast from 'react-hot-toast'
import { formatPrice } from '../../utils/format'

export type DealRecord = Record<string, unknown>

function formatDiscount(deal: DealRecord) {
  const type = String(deal.type || '')
  const val = deal.discount_value
  if (val == null) return String(type).replace(/_/g, ' ')
  if (type === 'percentage_discount') return `${val}% off`
  if (type === 'fixed_discount') return `${formatPrice(Number(val))} off`
  return String(type).replace(/_/g, ' ')
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
  switch (deal.cta_type) {
    case 'use_coupon':
      return 'Use coupon'
    case 'message_supplier':
      return 'Message supplier'
    case 'view_products':
      return 'View products'
    default:
      return 'Order now'
  }
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
    <div className="flex flex-col items-end gap-1 shrink-0">
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

export function DealCard({ deal }: { deal: DealRecord }) {
  const navigate = useNavigate()
  const [recordInteraction] = useRecordDealInteractionMutation()
  const [redeemCoupon] = useUseDealCouponMutation()
  const [messageFromDeal, { isLoading: messaging }] = useMessageFromDealMutation()

  const dealId = String(deal.id)
  const supplierId = String(deal.supplier_id || '')
  const isSponsored = Boolean(deal.is_sponsored)

  const trackClick = async () => {
    try {
      await recordInteraction({ id: dealId, interactionType: 'click' }).unwrap()
    } catch {
      /* non-blocking */
    }
  }

  const handleCta = async () => {
    await trackClick()
    const cta = deal.cta_type || 'order_now'

    if (cta === 'use_coupon') {
      try {
        const result = await redeemCoupon(dealId).unwrap()
        await navigator.clipboard.writeText(result.couponCode)
        toast.success(`Coupon copied: ${result.couponCode}`)
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
    <Card
      className={`overflow-hidden ${isSponsored ? 'border-[var(--brand)] ring-1 ring-[var(--brand)]/20' : ''}`}
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
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Tag className="h-4 w-4 shrink-0 text-[var(--brand)]" />
              <span className="truncate">{String(deal.name)}</span>
            </CardTitle>
            <p className="text-xs text-[var(--text-muted)] flex items-center gap-1 mt-1">
              <Building2 className="h-3 w-3 shrink-0" />
              {String(deal.supplier_name || 'Supplier')}
            </p>
          </div>
          <DealBadges deal={deal} isSponsored={isSponsored} />
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
          <p className="text-xs font-mono bg-[var(--app-muted)] px-2 py-1 rounded inline-block">
            Code: {String(deal.coupon_code)}
          </p>
        ) : null}
        {deal.description ? (
          <p className="text-[var(--text-muted)] line-clamp-2">{String(deal.description)}</p>
        ) : null}
        <p className="text-xs text-[var(--text-muted)]">Valid until {formatValidUntil(deal)}</p>
        <Button size="sm" className="w-full" onClick={handleCta} disabled={messaging}>
          <CtaIcon cta={String(deal.cta_type || 'order_now')} />
          {ctaLabel(deal)}
        </Button>
      </CardContent>
    </Card>
  )
}

function DealBannerPlaceholderInner() {
  return (
    <div className="w-full h-24 bg-gradient-to-br from-[var(--brand)]/15 to-[var(--app-muted)] flex items-center justify-center">
      <Tag className="h-8 w-8 text-[var(--brand)]/40" />
    </div>
  )
}
