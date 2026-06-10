import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useGetNewDealsBannerQuery, useDismissDealBannerMutation } from '../../services/api'
import { InfoBanner } from '../ui/info-banner'
import { Tag, X } from 'lucide-react'

function formatDiscount(deal: { discountType?: string; discountValue?: number }) {
  if (!deal.discountValue) return null
  if (deal.discountType?.includes('percentage')) return `${deal.discountValue}% off`
  return `$${deal.discountValue} off`
}

export function NewDealsBanner() {
  const { data } = useGetNewDealsBannerQuery(undefined, {
    pollingInterval: 0,
    refetchOnMountOrArgChange: false,
  })
  const [dismissBanner] = useDismissDealBannerMutation()

  const banner = useMemo(() => data?.summary, [data])
  const primaryDeal = data?.deals?.[0]

  if (!banner || !primaryDeal) return null

  const discountLabel = formatDiscount(primaryDeal)

  const handleDismiss = () => {
    void dismissBanner(primaryDeal.id)
  }

  const description =
    banner.count > 1 ? (
      <>
        {banner.supplierNames?.join(', ')}
        {banner.count > 3 ? ` and ${banner.count - 3} more` : ''} — tap to browse deals.
      </>
    ) : (
      <>
        {primaryDeal.name}
        {discountLabel ? ` · ${discountLabel}` : ''}
      </>
    )

  return (
    <InfoBanner
      tone="neutral"
      icon={Tag}
      title={banner.title}
      description={description}
      className="mx-3 mb-0 sm:mx-6"
      data-testid="new-deals-banner"
      action={
        <div className="flex items-center gap-2">
          <Link
            to={`/app/deals?highlight=${primaryDeal.id}`}
            className="font-medium text-[var(--brand)] underline hover:no-underline text-sm"
          >
            View deal{banner.count > 1 ? 's' : ''}
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--app-border)]"
            aria-label="Dismiss deal banner"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      }
    />
  )
}
