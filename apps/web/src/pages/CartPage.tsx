import { useAppDispatch, useAppSelector } from '../hooks/redux'
import {
  useCreateOrderMutation,
  useGetActivePromotionsQuery,
  useGetEntitlementsQuery,
  useResolveContractPricesMutation,
} from '../services/api'
import { updateItemResolvedPrice } from '../features/cart/cartSlice'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { EmptyState } from '../components/ui/empty-state'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog'
import { LimitExceededBanner } from '../components/LimitExceededBanner'
import { splitRowClass } from '../components/ui/card-layout'
import { ShoppingCart, Trash2, Plus, Minus, Save, Calendar, FileText } from 'lucide-react'
import { useCartActions } from '../hooks/useCartActions'
import { useWorkspaceRole } from '../hooks/useWorkspaceRole'
import {
  formatOrderPlaceGateMessage,
  getOrderPlaceGate,
  getDealRedeemGate,
} from '../lib/planLimits'
import { openBrowseUpgrade } from '../lib/openBrowseUpgrade'
import { toast } from 'sonner'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { formatPrice } from '../utils/format'
import { usePermissions } from '../hooks/usePermissions'
import { useImpersonation } from '../hooks/useImpersonation'
import { RequirePermission } from '../components/RequirePermission'

export function CartPage() {
  const { t } = useTranslation('cart')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { groups, total, drafts } = useAppSelector((state) => state.cart)
  const { user } = useAppSelector((state) => state.auth)
  const { shouldLoadTenantEntitlements } = useImpersonation()
  const { persona } = useWorkspaceRole()
  const cartTitle = persona.pageCopy?.cart?.title ?? t('page.title')
  const cartDescription = persona.pageCopy?.cart?.description ?? t('page.description')
  const { can } = usePermissions()
  const canPlaceOrders = can('ORDERS_CREATE')
  const { data: dealsData } = useGetActivePromotionsQuery()
  const { data: entitlementsData } = useGetEntitlementsQuery(undefined, {
    skip: !shouldLoadTenantEntitlements,
  })
  const orderGate = useMemo(
    () => getOrderPlaceGate(entitlementsData?.entitlements, groups.length),
    [entitlementsData?.entitlements, groups.length]
  )
  const dealRedeemGate = getDealRedeemGate(entitlementsData?.entitlements)
  const canRedeemDeals = dealRedeemGate.canRedeem
  const estimatedPromoDiscount = canRedeemDeals
    ? (dealsData?.promotions || []).reduce((max, p) => {
        const val = Number(p.discount_value || 0)
        if (p.type === 'percentage_discount') {
          return Math.max(max, (total * val) / 100)
        }
        if (p.type === 'fixed_discount') {
          return Math.max(max, val)
        }
        return max
      }, 0)
    : 0
  const checkoutTotal = Math.max(0, total - estimatedPromoDiscount)
  const supplierOrderCount = groups.length
  const placeOrderLabel =
    supplierOrderCount > 1
      ? t('page.placeOrders', { count: supplierOrderCount })
      : t('page.placeOrder')
  const confirmOrderLabel =
    supplierOrderCount > 1
      ? t('page.placeOrders', { count: supplierOrderCount })
      : t('page.confirmOrder')
  const {
    updateQuantity,
    removeItem,
    clearCart,
    saveDraft,
    loadDraft,
    deleteDraft,
    rehydrateCart,
  } = useCartActions()
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [createOrder] = useCreateOrderMutation()
  const [resolveContractPrices] = useResolveContractPricesMutation()
  const ownerEmail = user?.email ?? null

  // Draft management
  const [showSaveDraft, setShowSaveDraft] = useState(false)
  const [showLoadDraft, setShowLoadDraft] = useState(false)
  const [draftName, setDraftName] = useState('')

  // Order details
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')
  const [couponCode, setCouponCode] = useState(searchParams.get('coupon') || '')
  const [promotionId, setPromotionId] = useState(searchParams.get('dealId') || '')

  useEffect(() => {
    const c = searchParams.get('coupon')
    if (c) setCouponCode(c)
    const d = searchParams.get('dealId')
    if (d) setPromotionId(d)
    const scheduledAt = searchParams.get('scheduledAt')
    if (scheduledAt) {
      const parsed = new Date(scheduledAt)
      if (!Number.isNaN(parsed.getTime())) {
        const year = parsed.getFullYear()
        const month = String(parsed.getMonth() + 1).padStart(2, '0')
        const day = String(parsed.getDate()).padStart(2, '0')
        setDeliveryDate(`${year}-${month}-${day}`)
      }
    }
  }, [searchParams])

  useEffect(() => {
    rehydrateCart()
  }, [rehydrateCart])

  const handleUpdateQuantity = async (productId: string, quantity: number) => {
    updateQuantity(productId, quantity)
    if (quantity <= 0) return
    const item = groups.flatMap((g) => g.items).find((i) => i.productId === productId)
    if (!item?.product.supplier_id || item.quoteResponseItemId) return
    try {
      const result = await resolveContractPrices({
        items: [
          {
            productId,
            supplierId: item.product.supplier_id,
            quantity,
          },
        ],
      }).unwrap()
      const resolved = result.items[0]
      if (resolved?.unitPrice != null) {
        dispatch(
          updateItemResolvedPrice({
            productId,
            currentPrice: resolved.unitPrice,
            pricingSource: resolved.source,
            catalogPrice: resolved.defaultPrice ?? undefined,
            ownerEmail,
          })
        )
      }
    } catch {
      // Order creation re-resolves server-side; cart preview is best-effort
    }
  }

  const handleRemoveItem = (productId: string) => {
    removeItem(productId)
    toast.success(t('toast.itemRemoved'))
  }

  const handleSaveDraft = () => {
    if (!draftName.trim()) {
      toast.error(t('toast.draftNameRequired'))
      return
    }
    saveDraft(draftName)
    setShowSaveDraft(false)
    setDraftName('')
    toast.success(t('toast.cartSavedDraft'))
  }

  const handleLoadDraft = (draftId: string) => {
    loadDraft(draftId)
    setShowLoadDraft(false)
    toast.success(t('toast.draftLoaded'))
  }

  const handleDeleteDraft = (draftId: string) => {
    deleteDraft(draftId)
    toast.success(t('toast.draftDeleted'))
  }

  const handlePlaceOrder = async () => {
    if (groups.length === 0) {
      toast.error(t('toast.cartEmpty'))
      return
    }

    if (!orderGate.canPlace) {
      openBrowseUpgrade(dispatch, {
        currentPlan: orderGate.planName,
        upgradeUrl: '/app/settings?tab=subscription',
      })
      return
    }

    // Show order details dialog
    setShowOrderDetails(true)
  }

  const handleConfirmOrder = async () => {
    if (!orderGate.canPlace) {
      openBrowseUpgrade(dispatch, {
        currentPlan: orderGate.planName,
        upgradeUrl: '/app/settings?tab=subscription',
      })
      return
    }

    setIsPlacingOrder(true)
    try {
      const items = groups.flatMap((group) =>
        group.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes,
        }))
      )

      const quoteLocks = groups
        .flatMap((group) => group.items)
        .filter((item) => item.quoteRequestSupplierId && item.quoteResponseItemId)
        .map((item) => ({
          productId: item.productId,
          quoteRequestSupplierId: item.quoteRequestSupplierId!,
          quoteResponseItemId: item.quoteResponseItemId!,
        }))

      await createOrder({
        items,
        quoteLocks: quoteLocks.length ? quoteLocks : undefined,
        deliveryDate: deliveryDate || undefined,
        notes: deliveryNotes || undefined,
        couponCode: canRedeemDeals ? couponCode.trim() || undefined : undefined,
        promotionId: canRedeemDeals ? promotionId || undefined : undefined,
      }).unwrap()

      clearCart()
      setShowOrderDetails(false)
      setDeliveryDate('')
      setDeliveryNotes('')
      if (supplierOrderCount > 1) {
        toast.success(t('toast.ordersPlaced', { count: supplierOrderCount }))
        navigate('/app/orders')
      } else {
        toast.success(t('toast.orderPlaced'))
      }
    } catch (error: any) {
      const errorMessage =
        error?.data?.error?.message || error?.message || t('toast.placeOrderFailed')
      const errorName = error?.data?.error?.name

      // For limit exceeded errors, show a more helpful message with upgrade suggestion
      if (errorName === 'LIMIT_EXCEEDED') {
        toast.error(errorMessage, {
          duration: 6000,
          icon: '⚠️',
        })
        // Show additional toast with upgrade link
        setTimeout(() => {
          toast.custom(
            (id) => (
              <div className="flex items-center gap-3">
                <span>{t('toast.upgradeHint')}</span>
                <button
                  onClick={() => {
                    toast.dismiss(id)
                    window.location.href = '/app/settings'
                  }}
                  className="px-3 py-1 text-sm font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand)]/90 erp-pressable"
                >
                  {t('toast.viewPlans')}
                </button>
              </div>
            ),
            {
              duration: 8000,
            }
          )
        }, 500)
      } else {
        toast.error(errorMessage)
      }
    } finally {
      setIsPlacingOrder(false)
    }
  }

  if (groups.length === 0) {
    return (
      <PageShell data-testid="cart-page">
        <PageHeader title={cartTitle} description={t('page.emptyDescription')} />
        <EmptyState
          title={t('page.emptyTitle')}
          description={t('page.emptyBody')}
          icon={<ShoppingCart className="h-6 w-6" aria-hidden />}
          action={
            <Button asChild>
              <a href="/app/products">{t('page.browseProducts')}</a>
            </Button>
          }
        />
      </PageShell>
    )
  }

  return (
    <RequirePermission permission="ORDERS_CREATE" title={t('page.title')}>
      <PageShell className="pb-28 lg:pb-6" data-testid="cart-page">
        <PageHeader
          title={cartTitle}
          description={cartDescription}
          actions={
            <>
              {drafts.length > 0 && (
                <Button variant="outline" onClick={() => setShowLoadDraft(true)}>
                  {t('page.loadDraft')}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setShowSaveDraft(true)}
                disabled={groups.length === 0}
              >
                <Save className="h-4 w-4 mr-2" />
                {t('page.saveDraft')}
              </Button>
              <Button variant="outline" onClick={() => clearCart()}>
                {t('page.clearCart')}
              </Button>
            </>
          }
        />

        {!orderGate.canPlace && orderGate.reason === 'at_limit' && orderGate.limit != null && (
          <LimitExceededBanner
            limitKey="orders_per_day"
            currentUsage={orderGate.current}
            limitValue={orderGate.limit}
            currentPlan={orderGate.planName}
            upgradeUrl="/app/settings?tab=subscription"
            className="border-red-200 bg-red-50 text-red-900 [&_p]:text-red-800"
          />
        )}
        {!orderGate.canPlace && orderGate.reason === 'would_exceed' && (
          <div
            className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="alert"
          >
            {formatOrderPlaceGateMessage(orderGate)}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {groups.map((group) => (
              <Card key={group.supplierId}>
                <CardContent className="space-y-4 pt-6">
                  <div>
                    <div className={splitRowClass}>
                      <span className="min-w-0 truncate text-base font-semibold text-[var(--text)]">
                        {group.supplierName}
                      </span>
                      <Badge variant="secondary" className="shrink-0">
                        ${formatPrice(group.subtotal)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                      {t('page.itemsCount', { count: group.items.length })}
                    </p>
                  </div>
                  {group.items.map((item) => {
                    const thumbUrl = item.product.image_thumb_url ?? item.product.image_url
                    return (
                      <div
                        key={item.productId}
                        className="flex flex-col gap-3 p-4 border rounded-lg sm:flex-row sm:items-center sm:gap-4"
                        data-testid={`cart-item-row-${item.productId}`}
                      >
                        <div className="w-16 h-16 shrink-0 bg-[var(--brand-ultra)] rounded-lg flex items-center justify-center">
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt={item.product.name}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          ) : (
                            <ShoppingCart className="h-6 w-6 text-[var(--text-muted)]" />
                          )}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium truncate">{item.product.name}</h4>
                          <p className="text-sm text-[var(--text-muted)]">
                            {t('page.sku')} {item.product.sku}
                          </p>
                          <p className="text-sm text-[var(--text-muted)]">
                            {formatPrice(item.product.current_price)}{' '}
                            {t('page.perUnit', {
                              unit: item.product.unit || t('page.defaultUnit'),
                            })}
                            {item.quoteResponseItemId && (
                              <Badge variant="secondary" className="ml-2 text-xs">
                                {t('page.quotedPriceLocked')}
                              </Badge>
                            )}
                            {item.product.pricing_source === 'CONTRACT_PRICE' &&
                              !item.quoteResponseItemId && (
                                <Badge variant="secondary" className="ml-2 text-xs">
                                  {t('page.yourPrice')}
                                </Badge>
                              )}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleUpdateQuantity(item.productId, item.quantity - 1)
                              }
                              disabled={item.quantity <= 1}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center tabular-nums">{item.quantity}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                handleUpdateQuantity(item.productId, item.quantity + 1)
                              }
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>

                          <p className="font-medium tabular-nums sm:text-right">
                            {formatPrice(
                              (typeof item.product.current_price === 'number'
                                ? item.product.current_price
                                : parseFloat(String(item.product.current_price ?? '')) || 0) *
                                item.quantity
                            )}
                          </p>

                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (item.productId) handleRemoveItem(item.productId)
                            }}
                            aria-label={t('page.removeItem')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-6">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <h3 className="text-base font-semibold text-[var(--text)]">
                  {supplierOrderCount > 1 ? t('page.checkoutPreview') : t('page.orderSummary')}
                </h3>
                {supplierOrderCount > 1 && (
                  <div
                    className="rounded-lg border border-[var(--app-border)] bg-[var(--brand-ultra)]/40 p-3 space-y-2 text-sm"
                    data-testid="cart-multi-supplier-preview"
                  >
                    <p className="font-medium text-[var(--text)]">
                      {t('page.separateOrders', { count: supplierOrderCount })}
                    </p>
                    <ul className="space-y-1.5">
                      {groups.map((group) => (
                        <li
                          key={group.supplierId}
                          className="flex items-center justify-between gap-2 text-[var(--text-muted)]"
                        >
                          <span className="truncate">{group.supplierName}</span>
                          <span className="shrink-0 tabular-nums">
                            {t('page.groupLine', {
                              amount: formatPrice(group.subtotal),
                              count: group.items.length,
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {orderGate.limit != null && (
                      <p className="text-xs text-[var(--text-muted)] pt-1 border-t border-[var(--app-border)]">
                        {t('page.dailyLimitHint', {
                          count: supplierOrderCount,
                          current: orderGate.current,
                          limit: orderGate.limit,
                        })}
                      </p>
                    )}
                  </div>
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-muted)]">{t('page.subtotal')}</span>
                  <span>${formatPrice(total)}</span>
                </div>
                {estimatedPromoDiscount > 0 ? (
                  <div className="flex items-center justify-between text-sm text-[var(--mint)]">
                    <span>{t('page.estDealSavings')}</span>
                    <span>-${formatPrice(estimatedPromoDiscount)}</span>
                  </div>
                ) : dealRedeemGate.limit != null ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    {t('page.dealRedemptions', {
                      current: dealRedeemGate.current,
                      limit: dealRedeemGate.limit,
                    })}
                    {!canRedeemDeals && dealRedeemGate.message
                      ? ` — ${dealRedeemGate.message}`
                      : ''}
                  </p>
                ) : null}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-muted)]">{t('page.tax')}</span>
                  <span>$0.00</span>
                </div>
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between font-semibold text-lg">
                    <span>
                      {supplierOrderCount > 1 ? t('page.combinedTotal') : t('page.total')}
                    </span>
                    <span>${formatPrice(checkoutTotal)}</span>
                  </div>
                </div>
                {estimatedPromoDiscount > 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">{t('page.finalDiscountHint')}</p>
                ) : null}
                {couponCode.trim() ? (
                  <p className="text-xs text-[var(--text-muted)]">{t('page.couponHint')}</p>
                ) : null}
              </CardContent>
            </Card>

            {!canPlaceOrders ? (
              <p className="text-sm text-[var(--text-muted)] text-center">
                {t('page.noPlacePermission')}
              </p>
            ) : null}
            <Button
              onClick={handlePlaceOrder}
              disabled={isPlacingOrder || !orderGate.canPlace || !canPlaceOrders}
              className="hidden w-full lg:flex"
              size="lg"
              data-testid="cart-place-order"
            >
              {isPlacingOrder
                ? t('page.placing')
                : !canPlaceOrders
                  ? t('page.cannotPlaceOrders')
                  : !orderGate.canPlace
                    ? t('page.dailyLimitReached')
                    : placeOrderLabel}
            </Button>
            {!orderGate.canPlace && (
              <Button
                type="button"
                variant="outline"
                className="hidden w-full lg:flex"
                onClick={() =>
                  openBrowseUpgrade(dispatch, {
                    currentPlan: orderGate.planName,
                    upgradeUrl: '/app/settings?tab=subscription',
                  })
                }
              >
                {t('page.upgradeForMore')}
              </Button>
            )}
          </div>
        </div>

        <div
          className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 border-t border-[var(--app-border)] bg-[var(--surface)]/95 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:hidden"
          data-testid="cart-mobile-checkout-bar"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs text-[var(--text-muted)]">{t('page.total')}</p>
              <p className="text-lg font-semibold tabular-nums">${formatPrice(checkoutTotal)}</p>
            </div>
            {canPlaceOrders ? (
              <Button
                onClick={handlePlaceOrder}
                disabled={isPlacingOrder || !orderGate.canPlace}
                size="lg"
                className="shrink-0"
                data-testid="cart-mobile-place-order"
              >
                {isPlacingOrder
                  ? t('page.placing')
                  : !orderGate.canPlace
                    ? t('page.limitReached')
                    : t('page.checkout')}
              </Button>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">{t('page.viewOnlyAccess')}</p>
            )}
          </div>
        </div>

        {/* Save Draft Dialog */}
        <Dialog open={showSaveDraft} onOpenChange={setShowSaveDraft}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('page.saveDraftDialogTitle')}</DialogTitle>
              <DialogDescription>{t('page.saveDraftDialogDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="draft-name">{t('page.draftName')}</Label>
                <Input
                  id="draft-name"
                  placeholder={t('page.draftNamePlaceholder')}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSaveDraft(false)}>
                {t('page.cancel')}
              </Button>
              <Button onClick={handleSaveDraft}>{t('page.saveDraft')}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Load Draft Dialog */}
        <Dialog open={showLoadDraft} onOpenChange={setShowLoadDraft}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('page.loadDraftDialogTitle')}</DialogTitle>
              <DialogDescription>{t('page.loadDraftDialogDescription')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {drafts.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">{t('page.noSavedDrafts')}</p>
              ) : (
                drafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="flex items-center justify-between border rounded-lg p-4"
                  >
                    <div>
                      <p className="font-medium">{draft.name}</p>
                      <p className="text-sm text-[var(--text-muted)]">
                        {t('page.draftItems', { count: draft.items.length })} •{' '}
                        {new Date(draft.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <Button size="sm" onClick={() => handleLoadDraft(draft.id)}>
                        {t('page.load')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteDraft(draft.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowLoadDraft(false)}>
                {t('page.close')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Order Details Dialog */}
        <Dialog open={showOrderDetails} onOpenChange={setShowOrderDetails}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {supplierOrderCount > 1 ? t('page.confirmCheckout') : t('page.orderDetails')}
              </DialogTitle>
              <DialogDescription>
                {supplierOrderCount > 1
                  ? t('page.confirmCheckoutDescription', { count: supplierOrderCount })
                  : t('page.orderDetailsDescription')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {supplierOrderCount > 1 && (
                <div
                  className="rounded-lg border border-[var(--app-border)] p-3 space-y-2 text-sm"
                  data-testid="cart-confirm-split-preview"
                >
                  {groups.map((group) => (
                    <div key={group.supplierId} className="flex justify-between gap-2">
                      <span className="font-medium truncate">{group.supplierName}</span>
                      <span className="text-[var(--text-muted)] shrink-0 tabular-nums">
                        ${formatPrice(group.subtotal)}
                      </span>
                    </div>
                  ))}
                  <div className="flex justify-between gap-2 pt-2 border-t border-[var(--app-border)] font-semibold">
                    <span>{t('page.combinedTotal')}</span>
                    <span>${formatPrice(checkoutTotal)}</span>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="delivery-date">
                  <Calendar className="h-4 w-4 inline mr-2" />
                  {t('page.preferredDeliveryDate')}
                </Label>
                <Input
                  id="delivery-date"
                  type="date"
                  value={deliveryDate}
                  onChange={(e) => setDeliveryDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="delivery-notes">
                  <FileText className="h-4 w-4 inline mr-2" />
                  {t('page.orderNotes')}
                </Label>
                <Textarea
                  id="delivery-notes"
                  placeholder={t('page.orderNotesPlaceholder')}
                  rows={4}
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowOrderDetails(false)}>
                {t('page.cancel')}
              </Button>
              <Button onClick={handleConfirmOrder} disabled={isPlacingOrder}>
                {isPlacingOrder ? t('page.placing') : confirmOrderLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    </RequirePermission>
  )
}
