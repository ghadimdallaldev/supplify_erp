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
import { useSearchParams } from 'react-router-dom'
import { formatPrice } from '../utils/format'
import { usePermissions } from '../hooks/usePermissions'
import { useImpersonation } from '../hooks/useImpersonation'
import { RequirePermission } from '../components/RequirePermission'

export function CartPage() {
  const [searchParams] = useSearchParams()
  const dispatch = useAppDispatch()
  const { groups, total, drafts } = useAppSelector((state) => state.cart)
  const { user } = useAppSelector((state) => state.auth)
  const { shouldLoadTenantEntitlements } = useImpersonation()
  const { persona } = useWorkspaceRole()
  const cartTitle = persona.pageCopy?.cart?.title ?? 'Shopping Cart'
  const cartDescription =
    persona.pageCopy?.cart?.description ?? 'Review your order before placing it'
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
  }, [searchParams])

  useEffect(() => {
    rehydrateCart()
  }, [rehydrateCart])

  const handleUpdateQuantity = async (productId: string, quantity: number) => {
    updateQuantity(productId, quantity)
    if (quantity <= 0) return
    const item = groups.flatMap((g) => g.items).find((i) => i.productId === productId)
    if (!item?.product.supplier_id) return
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
    toast.success('Item removed from cart')
  }

  const handleSaveDraft = () => {
    if (!draftName.trim()) {
      toast.error('Please enter a name for your draft')
      return
    }
    saveDraft(draftName)
    setShowSaveDraft(false)
    setDraftName('')
    toast.success('Cart saved as draft!')
  }

  const handleLoadDraft = (draftId: string) => {
    loadDraft(draftId)
    setShowLoadDraft(false)
    toast.success('Draft loaded into cart')
  }

  const handleDeleteDraft = (draftId: string) => {
    deleteDraft(draftId)
    toast.success('Draft deleted')
  }

  const handlePlaceOrder = async () => {
    if (groups.length === 0) {
      toast.error('Cart is empty')
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

      await createOrder({
        items,
        deliveryDate: deliveryDate || undefined,
        notes: deliveryNotes || undefined,
        couponCode: canRedeemDeals ? couponCode.trim() || undefined : undefined,
        promotionId: canRedeemDeals ? promotionId || undefined : undefined,
      }).unwrap()

      clearCart()
      setShowOrderDetails(false)
      setDeliveryDate('')
      setDeliveryNotes('')
      toast.success('Order placed successfully!')
    } catch (error: any) {
      // Show the actual error message from the API
      const errorMessage = error?.data?.error?.message || error?.message || 'Failed to place order'
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
                <span>💡 Want more orders? Upgrade your subscription!</span>
                <button
                  onClick={() => {
                    toast.dismiss(id)
                    window.location.href = '/app/settings'
                  }}
                  className="px-3 py-1 text-sm font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand)]/90 erp-pressable"
                >
                  View Plans
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
      <div className="space-y-6">
        <PageHeader title={cartTitle} description="Your cart is empty" />
        <EmptyState
          title="No items in your cart"
          description="Browse products from your suppliers to start an order."
          icon={<ShoppingCart className="h-6 w-6" aria-hidden />}
          action={
            <Button asChild>
              <a href="/app/products">Browse Products</a>
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <RequirePermission permission="ORDERS_CREATE" title="cart">
      <div className="space-y-6" data-testid="cart-page">
        <PageHeader
          title={cartTitle}
          description={cartDescription}
          actions={
            <>
              {drafts.length > 0 && (
                <Button variant="outline" onClick={() => setShowLoadDraft(true)}>
                  Load Draft
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setShowSaveDraft(true)}
                disabled={groups.length === 0}
              >
                <Save className="h-4 w-4 mr-2" />
                Save Draft
              </Button>
              <Button variant="outline" onClick={() => clearCart()}>
                Clear Cart
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
                      {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {group.items.map((item) => (
                    <div
                      key={item.productId}
                      className="flex flex-col gap-3 p-4 border rounded-lg sm:flex-row sm:items-center sm:gap-4"
                      data-testid={`cart-item-row-${item.productId}`}
                    >
                      <div className="w-16 h-16 shrink-0 bg-[var(--brand-ultra)] rounded-lg flex items-center justify-center">
                        {item.product.image_url ? (
                          <img
                            src={item.product.image_url}
                            alt={item.product.name}
                            className="w-full h-full object-cover rounded-lg"
                          />
                        ) : (
                          <ShoppingCart className="h-6 w-6 text-[var(--text-muted)]" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate">{item.product.name}</h4>
                        <p className="text-sm text-[var(--text-muted)]">SKU: {item.product.sku}</p>
                        <p className="text-sm text-[var(--text-muted)]">
                          {formatPrice(item.product.current_price)} per{' '}
                          {item.product.unit || 'unit'}
                          {item.product.pricing_source === 'CONTRACT_PRICE' && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              Your price
                            </Badge>
                          )}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUpdateQuantity(item.productId, item.quantity - 1)}
                            disabled={item.quantity <= 1}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <span className="w-8 text-center tabular-nums">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleUpdateQuantity(item.productId, item.quantity + 1)}
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
                          aria-label="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-6">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <h3 className="text-base font-semibold text-[var(--text)]">Order Summary</h3>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Subtotal</span>
                  <span>${formatPrice(total)}</span>
                </div>
                {estimatedPromoDiscount > 0 ? (
                  <div className="flex items-center justify-between text-sm text-[var(--mint)]">
                    <span>Est. deal savings</span>
                    <span>-${formatPrice(estimatedPromoDiscount)}</span>
                  </div>
                ) : dealRedeemGate.limit != null ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    Deal redemptions today: {dealRedeemGate.current}/{dealRedeemGate.limit}
                    {!canRedeemDeals && dealRedeemGate.message
                      ? ` — ${dealRedeemGate.message}`
                      : ''}
                  </p>
                ) : null}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Tax</span>
                  <span>$0.00</span>
                </div>
                <div className="border-t pt-4">
                  <div className="flex items-center justify-between font-semibold text-lg">
                    <span>Total</span>
                    <span>${formatPrice(Math.max(0, total - estimatedPromoDiscount))}</span>
                  </div>
                </div>
                {estimatedPromoDiscount > 0 ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    Final discount applied at checkout based on eligible supplier deals.
                  </p>
                ) : null}
                {couponCode.trim() ? (
                  <p className="text-xs text-[var(--text-muted)]">
                    Coupon from deal will be applied at checkout when eligible.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            {!canPlaceOrders ? (
              <p className="text-sm text-[var(--text-muted)] text-center">
                Your role does not have permission to place orders. Contact your workspace admin.
              </p>
            ) : null}
            <Button
              onClick={handlePlaceOrder}
              disabled={isPlacingOrder || !orderGate.canPlace || !canPlaceOrders}
              className="w-full"
              size="lg"
              data-testid="cart-place-order"
            >
              {isPlacingOrder
                ? 'Placing Order...'
                : !canPlaceOrders
                  ? 'Cannot place orders'
                  : !orderGate.canPlace
                    ? 'Daily order limit reached'
                    : 'Place Order'}
            </Button>
            {!orderGate.canPlace && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  openBrowseUpgrade(dispatch, {
                    currentPlan: orderGate.planName,
                    upgradeUrl: '/app/settings?tab=subscription',
                  })
                }
              >
                Upgrade to place more orders
              </Button>
            )}
          </div>
        </div>

        {/* Save Draft Dialog */}
        <Dialog open={showSaveDraft} onOpenChange={setShowSaveDraft}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Cart as Draft</DialogTitle>
              <DialogDescription>Save your current cart to load it later</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="draft-name">Draft Name</Label>
                <Input
                  id="draft-name"
                  placeholder="e.g., Weekly Order"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSaveDraft(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveDraft}>Save Draft</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Load Draft Dialog */}
        <Dialog open={showLoadDraft} onOpenChange={setShowLoadDraft}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Load Draft</DialogTitle>
              <DialogDescription>Select a saved draft to load into your cart</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {drafts.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No saved drafts</p>
              ) : (
                drafts.map((draft) => (
                  <div
                    key={draft.id}
                    className="flex items-center justify-between border rounded-lg p-4"
                  >
                    <div>
                      <p className="font-medium">{draft.name}</p>
                      <p className="text-sm text-[var(--text-muted)]">
                        {draft.items.length} items •{' '}
                        {new Date(draft.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex space-x-2">
                      <Button size="sm" onClick={() => handleLoadDraft(draft.id)}>
                        Load
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
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Order Details Dialog */}
        <Dialog open={showOrderDetails} onOpenChange={setShowOrderDetails}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Order Details</DialogTitle>
              <DialogDescription>Add delivery information and notes</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="delivery-date">
                  <Calendar className="h-4 w-4 inline mr-2" />
                  Preferred Delivery Date
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
                  Order Notes
                </Label>
                <Textarea
                  id="delivery-notes"
                  placeholder="Special instructions, delivery window, etc."
                  rows={4}
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowOrderDetails(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmOrder} disabled={isPlacingOrder}>
                {isPlacingOrder ? 'Placing Order...' : 'Confirm Order'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RequirePermission>
  )
}
