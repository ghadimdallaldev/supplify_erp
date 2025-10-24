import { useAppSelector } from '../hooks/redux'
import { useCreateOrderMutation } from '../services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { ShoppingCart, Trash2, Plus, Minus } from 'lucide-react'
import { useAppDispatch } from '../hooks/redux'
import { updateQuantity, removeItem, clearCart } from '../features/cart/cartSlice'
import toast from 'react-hot-toast'
import { useState } from 'react'

export function CartPage() {
  const { groups, total } = useAppSelector((state) => state.cart)
  const dispatch = useAppDispatch()
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)
  const [createOrder] = useCreateOrderMutation()

  const handleUpdateQuantity = (productId: string, quantity: number) => {
    dispatch(updateQuantity({ productId, quantity }))
  }

  const handleRemoveItem = (productId: string) => {
    dispatch(removeItem(productId))
    toast.success('Item removed from cart')
  }

  const handlePlaceOrder = async () => {
    if (groups.length === 0) {
      toast.error('Cart is empty')
      return
    }

    setIsPlacingOrder(true)
    try {
      const items = groups.flatMap(group => 
        group.items.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes,
        }))
      )

      await createOrder({ items }).unwrap()
      dispatch(clearCart())
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
        <Button
          variant="outline"
          onClick={() => dispatch(clearCart())}
        >
          Clear Cart
        </Button>
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
    </div>
  )
}
