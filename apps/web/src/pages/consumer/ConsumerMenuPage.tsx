import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  useGetPublicConsumerMenuQuery,
  useGetPublicConsumerStorefrontQuery,
  type ConsumerMenuItem,
} from '../../services/consumerApi'
import { CartDrawer } from '../../components/consumer/CartDrawer'
import { OrderSheet } from '../../components/consumer/OrderSheet'
import { CategoryNav } from '../../components/consumer/CategoryNav'
import { MenuItemCard } from '../../components/consumer/MenuItemCard'
import { FloatingCartBar } from '../../components/consumer/FloatingCartBar'
import { Input } from '../../components/ui/input'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import { toast } from 'sonner'
import { useConsumerCart } from '../../hooks/useConsumerCart'
import { PageShell } from '../../components/ui/page-shell'
import { Search, CalendarClock, X } from 'lucide-react'
import { Alert, AlertDescription } from '../../components/ui/alert'
import { orderingStatusFromBranch, formatMinutesToTime } from '../../lib/consumerOrderingHours'
import type { ConsumerOrderingStatus } from '../../services/consumerApi'
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

function countMenuItems(categories: Array<{ items: unknown[] }> | undefined) {
  return categories?.reduce((sum, cat) => sum + cat.items.length, 0) ?? 0
}

export function ConsumerMenuPage() {
  const { t } = useTranslation('consumer')

  useEffect(() => {
    void ensureNamespace('consumer')
  }, [])

  const { restaurantSlug } = useParams<{ restaurantSlug: string }>()
  const slug = restaurantSlug ?? ''
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const branchId = searchParams.get('branchId') ?? undefined
  const { cart, cartCount, cartTotal, addLine, updateQuantity, removeLine } = useConsumerCart(slug)

  const [cartOpen, setCartOpen] = useState(false)
  const [orderItem, setOrderItem] = useState<ConsumerMenuItem | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategoryId, setActiveCategoryId] = useState<string>()
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const scrollSpyPaused = useRef(false)

  const { data: storefront } = useGetPublicConsumerStorefrontQuery(slug, { skip: !slug })

  const activeBranch = useMemo(() => {
    const branches = storefront?.branches ?? []
    if (branchId) return branches.find((b) => b.branchId === branchId) ?? branches[0]
    return branches[0]
  }, [branchId, storefront?.branches])

  const orderingStatus = useMemo(() => orderingStatusFromBranch(activeBranch), [activeBranch])
  const orderingMessage = useMemo(
    () => localizedOrderingMessage(orderingStatus, t),
    [orderingStatus, t]
  )
  const orderingClosed = orderingStatus.mode === 'CLOSED'

  const {
    data: branchMenuData,
    isLoading: branchMenuLoading,
    isError: branchMenuError,
  } = useGetPublicConsumerMenuQuery(
    { restaurantSlug: slug, branchId },
    { skip: !slug || !branchId }
  )

  const {
    data: allBranchesMenuData,
    isLoading: allMenuLoading,
    isError: allMenuError,
  } = useGetPublicConsumerMenuQuery({ restaurantSlug: slug }, { skip: !slug || !!branchId })

  const branchMenuEmpty =
    !!branchId && !branchMenuLoading && countMenuItems(branchMenuData?.menu.categories) === 0

  const { data: fallbackMenuData, isLoading: fallbackLoading } = useGetPublicConsumerMenuQuery(
    { restaurantSlug: slug },
    { skip: !slug || !branchMenuEmpty }
  )

  const data = branchId
    ? branchMenuEmpty
      ? fallbackMenuData
      : branchMenuData
    : allBranchesMenuData

  const isLoading = branchId
    ? branchMenuLoading || (branchMenuEmpty && fallbackLoading)
    : allMenuLoading

  const isError = branchId ? branchMenuError && !branchMenuEmpty : allMenuError

  const usingFallbackMenu = branchMenuEmpty && countMenuItems(fallbackMenuData?.menu.categories) > 0

  // Default branch for checkout — only add to URL once storefront loads
  useEffect(() => {
    if (branchId || !storefront?.branches.length) return
    const params = new URLSearchParams(searchParams)
    params.set('branchId', storefront.branches[0].branchId)
    setSearchParams(params, { replace: true })
  }, [branchId, searchParams, setSearchParams, storefront?.branches])

  const filteredCategories = useMemo(() => {
    const categories = data?.menu.categories ?? []
    const q = searchQuery.trim().toLowerCase()
    if (!q) return categories
    return categories
      .map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.name.toLowerCase().includes(q) ||
            (item.description ?? '').toLowerCase().includes(q)
        ),
      }))
      .filter((cat) => cat.items.length > 0)
  }, [data?.menu.categories, searchQuery])

  const totalItems = useMemo(
    () => filteredCategories.reduce((sum, cat) => sum + cat.items.length, 0),
    [filteredCategories]
  )

  useEffect(() => {
    if (filteredCategories.length && !activeCategoryId) {
      setActiveCategoryId(filteredCategories[0].id)
    }
  }, [activeCategoryId, filteredCategories])

  useEffect(() => {
    const sections = filteredCategories
      .map((cat) => sectionRefs.current[cat.id])
      .filter((el): el is HTMLElement => !!el)

    if (!sections.length || searchQuery) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (scrollSpyPaused.current) return
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const top = visible[0]
        if (!top) return
        const id = top.target.id.replace('category-', '')
        setActiveCategoryId(id)
      },
      { rootMargin: '-36% 0px -52% 0px', threshold: [0, 0.15, 0.35, 0.55] }
    )

    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [filteredCategories, searchQuery])

  const scrollToCategory = useCallback((categoryId: string) => {
    setActiveCategoryId(categoryId)
    scrollSpyPaused.current = true
    sectionRefs.current[categoryId]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(() => {
      scrollSpyPaused.current = false
    }, 600)
  }, [])

  const handleItemSelect = (item: ConsumerMenuItem) => {
    if (orderingClosed) {
      toast.error(orderingMessage)
      return
    }
    if ('is_available' in item && item.is_available === false) return
    setOrderItem(item)
  }

  const checkoutBranchId = branchId ?? storefront?.branches[0]?.branchId

  const goCheckout = () => {
    if (orderingClosed) {
      toast.error(orderingMessage)
      return
    }
    if (!cart.length) {
      toast.error(t('menu.cartEmpty'))
      return
    }
    navigate(
      checkoutBranchId
        ? `/order/${slug}/checkout?branchId=${checkoutBranchId}`
        : `/order/${slug}/checkout`
    )
  }

  if (!slug) {
    return <p className="p-6 text-muted-foreground">{t('menu.slugRequired')}</p>
  }

  return (
    <PageShell className="space-y-5 p-4 pb-28">
      {orderingStatus.mode !== 'LIVE' && (
        <Alert
          className={
            orderingStatus.mode === 'PREORDER_ONLY'
              ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
              : undefined
          }
          variant={orderingStatus.mode === 'CLOSED' ? 'destructive' : 'default'}
        >
          <CalendarClock className="h-4 w-4" />
          <AlertDescription>{orderingMessage}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-1">
        {!isLoading && totalItems > 0 && (
          <p className="text-sm text-[var(--text-muted)]">
            {t('menu.itemCount', { count: totalItems })}
            {!searchQuery && filteredCategories.length > 1
              ? ` · ${t('menu.categoryCount', { count: filteredCategories.length })}`
              : ''}
          </p>
        )}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('menu.searchPlaceholder')}
            className="h-11 rounded-xl border-[var(--app-border)] bg-[var(--surface)] pl-9 pr-9 shadow-none focus-visible:ring-[var(--brand-mid)]/25"
            aria-label={t('menu.searchAria')}
          />
          {searchQuery && (
            <button
              type="button"
              className="consumer-pressable absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--brand-ultra)] hover:text-[var(--text)]"
              onClick={() => setSearchQuery('')}
              aria-label={t('menu.clearSearch')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {usingFallbackMenu && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
          {t('menu.fallbackNotice')}
        </p>
      )}

      {!searchQuery && filteredCategories.length > 0 && (
        <CategoryNav
          categories={filteredCategories.map((c) => ({ id: c.id, name: c.name }))}
          activeCategoryId={activeCategoryId}
          onSelect={scrollToCategory}
        />
      )}

      {isLoading && (
        <div className="space-y-6">
          <Skeleton className="h-9 w-48 rounded-lg" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-3 border-b border-[var(--app-border)] pb-3.5">
              <Skeleton className="h-[72px] w-[72px] shrink-0 rounded-xl" />
              <div className="flex flex-1 flex-col gap-2 py-1">
                <Skeleton className="h-4 w-3/5" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && <p className="text-center text-muted-foreground">{t('menu.loadError')}</p>}

      {filteredCategories.map((category) => (
        <section
          key={category.id}
          ref={(el) => {
            sectionRefs.current[category.id] = el
          }}
          className="scroll-mt-36"
          id={`category-${category.id}`}
          aria-labelledby={`category-heading-${category.id}`}
        >
          <div className="mb-2 flex items-baseline justify-between gap-3 border-b border-[var(--app-border)] pb-2">
            <div className="min-w-0">
              <h2
                id={`category-heading-${category.id}`}
                className="text-base font-semibold text-[var(--text)]"
              >
                {category.name}
              </h2>
              {category.description && (
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">{category.description}</p>
              )}
            </div>
            {category.items.length > 0 && (
              <span className="shrink-0 text-xs tabular-nums text-[var(--text-muted)]">
                {category.items.length}
              </span>
            )}
          </div>
          <div>
            {category.items.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                onSelect={handleItemSelect}
                orderingMode={orderingStatus.mode}
              />
            ))}
            {!category.items.length && (
              <p className="py-4 text-sm text-[var(--text-muted)]">{t('menu.noItemsInCategory')}</p>
            )}
          </div>
        </section>
      ))}

      {!isLoading && !isError && !filteredCategories.length && (
        <div className="space-y-4 py-12 text-center">
          <p className="text-base font-medium text-[var(--text)]">
            {searchQuery ? t('menu.empty.noMatches') : t('menu.empty.comingSoon')}
          </p>
          <p className="mx-auto max-w-sm text-sm text-[var(--text-muted)]">
            {searchQuery
              ? t('menu.empty.noMatchesDescription', { query: searchQuery })
              : t('menu.empty.unpublished')}
          </p>
          {searchQuery && (
            <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
              {t('menu.clearSearchAction')}
            </Button>
          )}
          {!searchQuery && (
            <p className="mx-auto max-w-md text-xs text-[var(--text-muted)]">
              {t('menu.empty.ownerHint')}{' '}
              <code className="rounded bg-[var(--brand-ultra)] px-1 py-0.5 font-mono text-[11px]">
                {t('menu.empty.seedScript')}
              </code>{' '}
              {t('menu.empty.ownerHintSuffix')}
            </p>
          )}
          {!searchQuery && branchId && storefront && storefront.branches.length > 1 && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/order/${slug}/menu`}>{t('menu.empty.tryAnotherLocation')}</Link>
            </Button>
          )}
        </div>
      )}

      <FloatingCartBar
        cartCount={cartCount}
        cartTotal={cartTotal}
        onOpenCart={() => setCartOpen(true)}
        onCheckout={goCheckout}
        checkoutDisabled={orderingClosed}
      />

      <CartDrawer
        open={cartOpen}
        onOpenChange={setCartOpen}
        lines={cart}
        total={cartTotal}
        onUpdateQuantity={updateQuantity}
        onRemoveLine={removeLine}
        onCheckout={() => {
          setCartOpen(false)
          goCheckout()
        }}
      />

      <OrderSheet
        open={!!orderItem}
        onOpenChange={(open) => {
          if (!open) setOrderItem(null)
        }}
        item={orderItem}
        orderingMode={orderingStatus.mode}
        onAdd={(input) => {
          if (orderingClosed) {
            toast.error(orderingMessage)
            return
          }
          addLine(input)
          toast.success(
            orderingStatus.mode === 'PREORDER_ONLY'
              ? t('menu.preorderedToCart', { name: input.name })
              : t('menu.addedToCart', { name: input.name })
          )
        }}
      />
    </PageShell>
  )
}

export default ConsumerMenuPage
