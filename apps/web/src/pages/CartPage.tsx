import { useAppSelector } from '../hooks/redux'
import { useCreateOrderMutation, useGetActivePromotionsQuery } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
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
import { ShoppingCart, Trash2, Plus, Minus, Save, Calendar, FileText } from 'lucide-react'
import { useCartActions } from '../hooks/useCartActions'
import toast from 'react-hot-toast'
import { useEffect, useState } from 'react'
import { formatPrice } from '../utils/format'

export function CartPage() {
  const { groups, total, drafts } = useAppSelector((state) => state.cart)
  const { data: dealsData } = useGetActivePromotionsQuery()
  const estimatedPromoDiscount = (dealsData?.promotions || []).reduce((max, p) => {
    const val = Number(p.discount_value || 0)
    if (p.type === 'percentage_discount') {
      return Math.max(max, (total * val) / 100)
    }
    if (p.type === 'fixed_discount') {
      return Math.max(max, val)
    }
    return max
  }, 0)
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

  // Draft management
  const [showSaveDraft, setShowSaveDraft] = useState(false)
  const [showLoadDraft, setShowLoadDraft] = useState(false)
  const [draftName, setDraftName] = useState('')

  // Order details
  const [showOrderDetails, setShowOrderDetails] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [deliveryNotes, setDeliveryNotes] = useState('')

  useEffect(() => {
    rehydrateCart()
  }, [rehydrateCart])

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    updateQuantity(productId, quantity)
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

    // Show order details dialog
    setShowOrderDetails(true)
  }

  const handleConfirmOrder = async () => {
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
          toast(
            (t) => (
              <div className="flex items-center gap-3">
                <span>💡 Want more orders? Upgrade your subscription!</span>
                <button
                  onClick={() => {
                    toast.dismiss(t.id)
                    window.location.href = '/app/settings'
                  }}
                  className="px-3 py-1 text-sm font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand)]/90"
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
        <div>
          <h1 className="text-[21px] font-black text-[var(--text)]">Shopping Cart</h1>
          <p className="text-[var(--text-muted)] mt-2">Your cart is empty</p>
        </div>

        <div className="text-center py-12">
          <ShoppingCart className="h-12 w-12 text-[var(--text-muted)] mx-auto mb-4" />
          <p className="text-[var(--text-muted)] mb-4">No items in your cart</p>
          <Button asChild>
            <a href="/app/products">Browse Products</a>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6" data-testid="cart-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[21px] font-black text-[var(--text)]">Shopping Cart</h1>
          <p className="text-[var(--text-muted)] mt-2">Review your order before placing it</p>
        </div>
        <div className="flex space-x-2">
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {groups.map((group) => (
            <Card key={group.supplierId}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{group.supplierName}</span>
                  <Badge variant="secondary">${formatPrice(group.subtotal)}</Badge>
                </CardTitle>
                <CardDescription>
                  {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.items.map((item) => (
                  <div
                    key={item.productId}
                    className="flex items-center space-x-4 p-4 border rounded-lg"
                    data-testid={`cart-item-row-${item.productId}`}
                  >
                    <div className="w-16 h-16 bg-[var(--brand-ultra)] rounded-lg flex items-center justify-center">
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

                    <div className="flex-1">
                      <h4 className="font-medium">{item.product.name}</h4>
                      <p className="text-sm text-[var(--text-muted)]">SKU: {item.product.sku}</p>
                      <p className="text-sm text-[var(--text-muted)]">
                        $
                        {typeof item.product.current_price === 'number'
                          ? formatPrice(item.product.current_price)
                          : item.product.current_price || 'N/A'}{' '}
                        per {item.product.unit || 'unit'}
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUpdateQuantity(item.productId, item.quantity - 1)}
                        disabled={item.quantity <= 1}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleUpdateQuantity(item.productId, item.quantity + 1)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="text-right">
                      <p className="font-medium">
                        $
                        {(typeof item.product.current_price === 'number'
                          ? item.product.current_price
                          : parseFloat(String(item.product.current_price ?? '')) || 0) *
                          item.quantity}
                      </p>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (item.productId) handleRemoveItem(item.productId)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--text-muted)]">Subtotal</span>
                <span>${formatPrice(total)}</span>
              </div>
              {estimatedPromoDiscount > 0 ? (
                <div className="flex items-center justify-between text-sm text-[var(--mint)]">
                  <span>Est. promotion savings</span>
                  <span>-${formatPrice(estimatedPromoDiscount)}</span>
                </div>
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
                  Final discount applied at checkout based on eligible supplier promotions.
                </p>
              ) : null}
            </CardContent>
          </Card>

          <Button
            onClick={handlePlaceOrder}
            disabled={isPlacingOrder}
            className="w-full"
            size="lg"
            data-testid="cart-place-order"
          >
            {isPlacingOrder ? 'Placing Order...' : 'Place Order'}
          </Button>
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
                      {draft.items.length} items • {new Date(draft.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex space-x-2">
                    <Button size="sm" onClick={() => handleLoadDraft(draft.id)}>
                      Load
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDeleteDraft(draft.id)}>
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
  )
}
