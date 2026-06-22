import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useGetNewDealsBannerQuery, useDismissDealBannerMutation } from '../../services/api'
import { InfoBanner } from '../ui/info-banner'
import { ensureNamespace } from '../../i18n'
import { Tag, X } from 'lucide-react'

function formatDiscount(
  deal: { discountType?: string; discountValue?: number },
  t: (key: string, options?: Record<string, unknown>) => string
) {
  if (!deal.discountValue) return null
  if (deal.discountType?.includes('percentage')) {
    return t('banner.percentageOff', { value: deal.discountValue })
  }
  return t('banner.fixedOff', { value: deal.discountValue })
}

export function NewDealsBanner() {
  const { t } = useTranslation('deals')
  const { data } = useGetNewDealsBannerQuery(undefined, {
    pollingInterval: 0,
    refetchOnMountOrArgChange: false,
  })
  const [dismissBanner] = useDismissDealBannerMutation()

  const banner = useMemo(() => data?.summary, [data])
  const primaryDeal = data?.deals?.[0]

  useEffect(() => {
    void ensureNamespace('deals')
  }, [])

  if (!banner || !primaryDeal) return null

  const discountLabel = formatDiscount(primaryDeal, t)

  const handleDismiss = () => {
    void dismissBanner(primaryDeal.id)
  }

  const description =
    banner.count > 1 ? (
      <>
        {banner.supplierNames?.join(', ')}
        {banner.count > 3 ? t('banner.andMore', { count: banner.count - 3 }) : ''}
        {t('banner.tapToBrowse')}
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
      data-testid="new-deals-banner"
      action={
        <div className="flex items-center gap-2">
          <Link
            to={`/app/deals?highlight=${primaryDeal.id}`}
            className="font-medium text-[var(--brand)] underline hover:no-underline text-sm"
          >
            {t('banner.viewDeal', { count: banner.count })}
          </Link>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--app-border)]"
            aria-label={t('banner.dismiss')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      }
    />
  )
}
