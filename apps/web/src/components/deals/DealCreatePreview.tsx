/**
 * Lightweight restaurant-facing preview while suppliers create a deal.
 */
import { useTranslation } from 'react-i18next'
import { Badge } from '../ui/badge'
import { Megaphone, Tag } from 'lucide-react'
import { formatPrice } from '../../utils/format'
import { formatDealTypeLabel, getCtaLabel } from '../../lib/dealDisplayLabels'

type Props = {
  name: string
  type: string
  discountValue: string
  ctaType: string
  couponCode?: string
  restaurantTypes?: string[]
  areas?: string[]
  boostSelected?: boolean
}

export function DealCreatePreview({
  name,
  type,
  discountValue,
  ctaType,
  couponCode,
  restaurantTypes = [],
  areas = [],
  boostSelected = false,
}: Props) {
  const { t } = useTranslation('deals')
  const title = name.trim() || t('createPreview.untitled')
  let discountLabel = formatDealTypeLabel(type)
  if (discountValue) {
    if (type.includes('percentage')) {
      discountLabel = t('labels.discount.percentageOff', { value: discountValue })
    } else if (type.includes('fixed')) {
      discountLabel = t('labels.discount.fixedOff', { value: formatPrice(Number(discountValue)) })
    }
  }

  return (
    <div
      className="rounded-lg border border-[var(--app-border)] bg-[var(--app-muted)]/40 p-3 space-y-2"
      data-testid="deal-create-preview"
    >
      <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wide">
        {t('createPreview.title')}
      </p>
      <div className="rounded-md border bg-[var(--app-surface)] p-3 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{title}</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">{discountLabel}</p>
          </div>
          {boostSelected ? (
            <Badge variant="outline" className="shrink-0 gap-1">
              <Megaphone className="h-3 w-3" />
              {t('labels.sponsored')}
            </Badge>
          ) : (
            <Badge variant="secondary" className="shrink-0 gap-1">
              <Tag className="h-3 w-3" />
              {formatDealTypeLabel(type)}
            </Badge>
          )}
        </div>
        <p className="text-xs mt-2 text-[var(--text-muted)]">
          {t('createPreview.cta', { cta: getCtaLabel(ctaType, 'restaurant') })}
          {ctaType === 'use_coupon' && couponCode
            ? ` · ${t('createPreview.coupon', { code: couponCode })}`
            : null}
        </p>
        {(restaurantTypes.length > 0 || areas.length > 0) && (
          <p className="text-xs mt-1 text-[var(--text-muted)]">
            {t('createPreview.audience', {
              types: restaurantTypes.length
                ? restaurantTypes.map((x) => x.replace(/_/g, ' ')).join(', ')
                : t('createPreview.allTypes'),
              areas: areas.length ? areas.join(', ') : t('createPreview.allAreas'),
            })}
          </p>
        )}
      </div>
      <p className="text-[11px] text-[var(--text-muted)]">{t('createPreview.helper')}</p>
    </div>
  )
}
