import { useAppSelector } from '../hooks/redux'
import { useCreateOrderMutation } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { ShoppingCart, Trash2, Plus, Minus, Save, Calendar, FileText } from 'lucide-react'
import { useAppDispatch } from '../hooks/redux'
import { updateQuantity, removeItem, clearCart, saveDraft, loadDraft, deleteDraft } from '../features/cart/cartSlice'
import toast from 'react-hot-toast'
import { useState } from 'react'

export function CartPage() {
  const { groups, total, drafts } = useAppSelector((state) => state.cart)
  const dispatch = useAppDispatch()
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

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    dispatch(updateQuantity({ productId, quantity }))
  }

  const handleRemoveItem = (productId: string) => {
    dispatch(removeItem(productId))
    toast.success('Item removed from cart')
  }

  const handleSaveDraft = () => {
    if (!draftName.trim()) {
      toast.error('Please enter a name for your draft')
      return
    }
    dispatch(saveDraft({ name: draftName }))
    setShowSaveDraft(false)
    setDraftName('')
    toast.success('Cart saved as draft!')
  }

  const handleLoadDraft = (draftId: string) => {
    dispatch(loadDraft(draftId))
    setShowLoadDraft(false)
    toast.success('Draft loaded into cart')
  }

  const handleDeleteDraft = (draftId: string) => {
    dispatch(deleteDraft(draftId))
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
      const items = groups.flatMap(group => 
        group.items.map(item => ({
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
      
      dispatch(clearCart())
      setShowOrderDetails(false)
      setDeliveryDate('')
      setDeliveryNotes('')
      toast.success('Order placed successfully!')
    } catch (error) {
      toast.error('Failed to place order')
    } finally {
      setIsPlacingOrder(false)
    }
  }

  if (groups.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Shopping Cart</h1>
          <p className="text-gray-600 mt-2">Your cart is empty</p>
        </div>
        
        <div className="text-center py-12">
          <ShoppingCart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">No items in your cart</p>
          <Button asChild>
            <a href="/app/products">Browse Products</a>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Shopping Cart</h1>
          <p className="text-gray-600 mt-2">
            Review your order before placing it
          </p>
        </div>
        <div className="flex space-x-2">
          {drafts.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setShowLoadDraft(true)}
            >
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
          <Button
            variant="outline"
            onClick={() => dispatch(clearCart())}
          >
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
                  <Badge variant="secondary">
                    ${group.subtotal.toFixed(2)}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {group.items.length} item{group.items.length !== 1 ? 's' : ''}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {group.items.map((item) => (
                  <div key={item.productId} className="flex items-center space-x-4 p-4 border rounded-lg">
                    <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
                      {item.product.image_url ? (
                        <img
                          src={item.product.image_url}
                          alt={item.product.name}
                          className="w-full h-full object-cover rounded-lg"
                        />
                      ) : (
                        <ShoppingCart className="h-6 w-6 text-gray-400" />
                      )}
                    </div>
                    
                    <div className="flex-1">
                      <h4 className="font-medium">{item.product.name}</h4>
                      <p className="text-sm text-gray-600">SKU: {item.product.sku}</p>
                      <p className="text-sm text-gray-600">
                        ${item.product.current_price?.toFixed(2) || 'N/A'} per {item.product.unit || 'unit'}
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
                        ${((item.product.current_price || 0) * item.quantity).toFixed(2)}
                      </p>
                    </div>
                    
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRemoveItem(item.productId)}
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
                <span className="text-gray-600">Subtotal</span>
                <span>${total.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Tax</span>
                <span>$0.00</span>
              </div>
              <div className="border-t pt-4">
                <div className="flex items-center justify-between font-semibold text-lg">
                  <span>Total</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button
            onClick={handlePlaceOrder}
            disabled={isPlacingOrder}
            className="w-full"
            size="lg"
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
            <DialogDescription>
              Save your current cart to load it later
            </DialogDescription>
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
            <DialogDescription>
              Select a saved draft to load into your cart
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {drafts.length === 0 ? (
              <p className="text-sm text-gray-600">No saved drafts</p>
            ) : (
              drafts.map((draft) => (
                <div key={draft.id} className="flex items-center justify-between border rounded-lg p-4">
                  <div>
                    <p className="font-medium">{draft.name}</p>
                    <p className="text-sm text-gray-600">
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
            <DialogDescription>
              Add delivery information and notes
            </DialogDescription>
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
