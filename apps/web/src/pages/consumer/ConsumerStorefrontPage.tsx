import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useGetPublicConsumerMenuQuery,
  useGetPublicConsumerStorefrontQuery,
  type ConsumerMenuItem,
  type ConsumerOrderingStatus,
} from '../../services/consumerApi'
import { useConsumerAuth } from '../../contexts/ConsumerAuthContext'
import { Button } from '../../components/ui/button'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { Skeleton } from '../../components/ui/skeleton'
import { orderingStatusFromBranch, formatMinutesToTime } from '../../lib/consumerOrderingHours'
import { formatPrice } from '../../utils/format'
import {
  ArrowRight,
  ChevronRight,
  Gift,
  MapPin,
  PackageSearch,
  Phone,
  ShoppingBag,
  Truck,
  UtensilsCrossed,
} from 'lucide-react'
import { ensureNamespace } from '../../i18n'

function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null
  const normalized = timeStr.trim()
  if (normalized === '24:00') return 1440
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function localizedOrderingMessage(
  status: ConsumerOrderingStatus,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const startLabel = formatMinutesToTime(parseTimeToMinutes(status.liveOrderStart) ?? 12 * 60)
  const endIsMidnight = status.liveOrderEnd === '00:00' || status.liveOrderEnd === '24:00'
  const endLabel = endIsMidnight ? t('ordering.midnight') : status.liveOrderEnd

  switch (status.mode) {
    case 'LIVE':
      return t('ordering.live', { end: endLabel })
    case 'PREORDER_ONLY':
      return t('ordering.preorderOnly', { start: startLabel })
    case 'CLOSED':
      return t('ordering.closed', { start: startLabel })
    default:
      return status.message
  }
}

function pickPreviewItems(
  categories: Array<{ items: ConsumerMenuItem[] }> | undefined,
  limit = 6
): ConsumerMenuItem[] {
  if (!categories?.length) return []
  const picked: ConsumerMenuItem[] = []
  for (const category of categories) {
    for (const item of category.items) {
      picked.push(item)
      if (picked.length >= limit) return picked
    }
  }
  return picked
}

function countMenuItems(categories: Array<{ items: unknown[] }> | undefined) {
  return categories?.reduce((sum, cat) => sum + cat.items.length, 0) ?? 0
}

export function ConsumerStorefrontPage() {
  const { t } = useTranslation('consumer')

  useEffect(() => {
    void ensureNamespace('consumer')
  }, [])

  const { restaurantSlug } = useParams<{ restaurantSlug: string }>()
  const slug = restaurantSlug ?? ''
  const [searchParams, setSearchParams] = useSearchParams()
  const branchId = searchParams.get('branchId')
  const { isAuthenticated } = useConsumerAuth()

  const {
    data: storefront,
    isLoading,
    isError,
  } = useGetPublicConsumerStorefrontQuery(slug, {
    skip: !slug,
  })

  const restaurant = storefront?.restaurant
  const branches = useMemo(() => storefront?.branches ?? [], [storefront?.branches])
  const activeBranch = useMemo(() => {
    if (branchId) return branches.find((b) => b.branchId === branchId) ?? branches[0]
    return branches[0]
  }, [branchId, branches])

  const defaultBranchId = activeBranch?.branchId
  const menuHref = defaultBranchId
    ? `/order/${slug}/menu?branchId=${defaultBranchId}`
    : `/order/${slug}/menu`

  const orderingStatus = useMemo(() => orderingStatusFromBranch(activeBranch), [activeBranch])
  const orderingMessage = useMemo(
    () => localizedOrderingMessage(orderingStatus, t),
    [orderingStatus, t]
  )

  useEffect(() => {
    if (branchId || !branches.length) return
    const params = new URLSearchParams(searchParams)
    params.set('branchId', branches[0].branchId)
    setSearchParams(params, { replace: true })
  }, [branchId, branches, searchParams, setSearchParams])

  const { data: menuData, isLoading: menuLoading } = useGetPublicConsumerMenuQuery(
    { restaurantSlug: slug, branchId: defaultBranchId },
    { skip: !slug || !defaultBranchId }
  )

  const menuItemCount = countMenuItems(menuData?.menu.categories)
  const previewItems = useMemo(
    () => pickPreviewItems(menuData?.menu.categories),
    [menuData?.menu.categories]
  )

  const fulfillmentLabels = useMemo(() => {
    if (!activeBranch) return []
    const labels: string[] = []
    if (activeBranch.deliveryEnabled) labels.push(t('fulfillment.DELIVERY'))
    if (activeBranch.takeawayEnabled) labels.push(t('fulfillment.pickup'))
    if (activeBranch.dineInEnabled) labels.push(t('fulfillment.DINE_IN'))
    return labels
  }, [activeBranch, t])

  if (!slug) {
    return (
      <PageShell className="p-6">
        <p className="text-center text-[var(--text-muted)]">{t('common.slugRequired')}</p>
      </PageShell>
    )
  }

  if (isLoading) {
    return (
      <PageShell className="space-y-6 p-4">
        <div className="flex gap-4">
          <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
          <div className="flex flex-1 flex-col gap-2 py-1">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
        <Skeleton className="h-12 w-full rounded-xl" />
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36 w-32 shrink-0 rounded-xl" />
          ))}
        </div>
      </PageShell>
    )
  }

  if (isError || !restaurant) {
    return (
      <PageShell className="p-6">
        <p className="text-center text-[var(--text-muted)]">{t('common.restaurantNotFound')}</p>
      </PageShell>
    )
  }

  return (
    <PageShell maxWidth="full" className="pb-6">
      <section className="border-b border-[var(--app-border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-3xl px-4 py-5">
          <div className="flex items-start gap-4">
            {restaurant.logoUrl ? (
              <img
                src={restaurant.logoUrl}
                alt=""
                className="h-16 w-16 shrink-0 rounded-2xl object-cover"
              />
            ) : (
              <div
                aria-hidden
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--brand-pale)] text-2xl font-semibold text-[var(--brand-mid)]"
              >
                {restaurant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1 pt-0.5">
              <PageHeader title={restaurant.name} description={orderingMessage} size="compact" />
              {fulfillmentLabels.length > 0 && (
                <p className="mt-2 text-xs text-[var(--text-muted)]">
                  {t('storefront.cashPayment', {
                    fulfillment: fulfillmentLabels.join(' · '),
                  })}
                </p>
              )}
            </div>
          </div>

          {activeBranch && (
            <dl className="mt-5 grid grid-cols-3 divide-x divide-[var(--app-border)] rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)]">
              <div className="px-3 py-3 text-center">
                <dt className="text-xs font-medium text-[var(--text-muted)]">
                  {t('storefront.prep')}
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--text)]">
                  {t('storefront.prepTime', { minutes: activeBranch.estimatedPrepMinutes })}
                </dd>
              </div>
              <div className="px-3 py-3 text-center">
                <dt className="text-xs font-medium text-[var(--text-muted)]">
                  {t('storefront.minOrder')}
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--text)]">
                  {formatPrice(activeBranch.minOrderAmount)}
                </dd>
              </div>
              <div className="px-3 py-3 text-center">
                <dt className="text-xs font-medium text-[var(--text-muted)]">
                  {t('common.delivery')}
                </dt>
                <dd className="mt-1 text-sm font-semibold tabular-nums text-[var(--text)]">
                  {t('storefront.deliveryFrom', {
                    amount: formatPrice(activeBranch.deliveryFee),
                  })}
                </dd>
              </div>
            </dl>
          )}

          <Button
            asChild
            size="lg"
            className="consumer-pressable mt-5 h-12 w-full bg-[var(--brand-mid)] text-base hover:bg-[var(--brand)]"
          >
            <Link to={menuHref}>
              <ShoppingBag className="mr-2 h-5 w-5" />
              {menuItemCount > 0
                ? t('storefront.browseMenuWithCount', { count: menuItemCount })
                : t('storefront.browseMenu')}
            </Link>
          </Button>
        </div>
      </section>

      {(menuLoading || previewItems.length > 0) && (
        <section className="border-b border-[var(--app-border)] py-5">
          <div className="mx-auto flex max-w-3xl items-end justify-between gap-3 px-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--text)]">
                {t('storefront.fromMenu')}
              </h2>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                {t('storefront.tapOrBrowse')}
              </p>
            </div>
            <Link
              to={menuHref}
              className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-[var(--brand-mid)] hover:text-[var(--brand)]"
            >
              {t('storefront.seeAll')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="consumer-menu-scroll mt-4 flex gap-3 overflow-x-auto px-4 pb-1 scrollbar-none">
            {menuLoading &&
              [0, 1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[148px] w-[132px] shrink-0 rounded-xl" />
              ))}
            {!menuLoading &&
              previewItems.map((item) => (
                <Link
                  key={item.id}
                  to={menuHref}
                  className="consumer-pressable flex w-[132px] shrink-0 flex-col rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3"
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      className="mb-2.5 h-[72px] w-full rounded-lg object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      aria-hidden
                      className="mb-2.5 flex h-[72px] w-full items-center justify-center rounded-lg bg-[var(--brand-pale)] text-lg font-semibold text-[var(--brand-mid)]"
                    >
                      {item.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <p className="line-clamp-2 text-sm font-medium leading-snug text-[var(--text)]">
                    {item.name}
                  </p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-[var(--brand-mid)]">
                    {formatPrice(Number(item.base_price))}
                  </p>
                </Link>
              ))}
          </div>
        </section>
      )}

      <section className="px-4 pt-2">
        <div className="mx-auto max-w-3xl divide-y divide-[var(--app-border)]">
          <Link
            to={`/order/${slug}/track`}
            className="consumer-menu-item flex items-center gap-3 py-4"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)]">
              <PackageSearch className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-[var(--text)]">
                {t('storefront.trackOrder')}
              </span>
              <span className="text-sm text-[var(--text-muted)]">
                {t('storefront.trackOrderHint')}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
          </Link>

          <Link
            to={isAuthenticated ? `/order/${slug}/rewards` : `/order/${slug}/account`}
            className="consumer-menu-item flex items-center gap-3 py-4"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)]">
              <Gift className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium text-[var(--text)]">
                {isAuthenticated ? t('storefront.myRewards') : t('storefront.joinRewards')}
              </span>
              <span className="text-sm text-[var(--text-muted)]">
                {isAuthenticated
                  ? t('storefront.rewardsAuthenticated')
                  : t('storefront.rewardsGuest')}
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
          </Link>

          {restaurant.phone && (
            <a
              href={`tel:${restaurant.phone}`}
              className="consumer-menu-item flex items-center gap-3 py-4"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-pale)] text-[var(--brand-mid)]">
                <Phone className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[var(--text)]">
                  {t('storefront.callRestaurant')}
                </span>
                <span className="text-sm text-[var(--text-muted)]">{restaurant.phone}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-[var(--text-muted)]" />
            </a>
          )}

          {activeBranch && (
            <div className="flex items-start gap-3 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand-ultra)] text-[var(--text-mid)]">
                <Truck className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--text)]">{activeBranch.branchName}</p>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                  {fulfillmentLabels.join(' · ')}
                  {activeBranch.deliveryZones.length > 0 &&
                    ` · ${t('storefront.deliveryZones', { count: activeBranch.deliveryZones.length })}`}
                </p>
              </div>
            </div>
          )}
        </div>

        {branches.length > 1 && (
          <div className="mx-auto mt-6 max-w-3xl">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text)]">
              <MapPin className="h-4 w-4 text-[var(--brand-mid)]" />
              {t('storefront.otherLocations')}
            </p>
            <div className="divide-y divide-[var(--app-border)] rounded-xl border border-[var(--app-border)]">
              {branches.map((branch) => (
                <Link
                  key={branch.branchId}
                  to={`/order/${slug}/menu?branchId=${branch.branchId}`}
                  className="consumer-menu-item flex items-center justify-between px-4 py-3 text-sm"
                >
                  <span className="font-medium text-[var(--text)]">{branch.branchName}</span>
                  <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {!isAuthenticated && (
          <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)] px-4 py-4">
            <div className="flex items-start gap-3">
              <UtensilsCrossed className="mt-0.5 h-5 w-5 shrink-0 text-[var(--brand-mid)]" />
              <div>
                <p className="text-sm font-medium text-[var(--text)]">
                  {t('storefront.firstTimeTitle')}
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {t('storefront.firstTimeDescription')}
                </p>
                <Button
                  asChild
                  variant="link"
                  className="consumer-pressable mt-1 h-auto p-0 text-[var(--brand-mid)]"
                >
                  <Link to={`/order/${slug}/account`}>{t('storefront.createFreeAccount')}</Link>
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>
    </PageShell>
  )
}

export default ConsumerStorefrontPage
