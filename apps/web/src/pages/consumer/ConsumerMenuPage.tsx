import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  useGetPublicConsumerMenuQuery,
  useGetPublicConsumerRestaurantQuery,
  type ConsumerMenuItem,
} from '../../services/consumerApi'
import { CartDrawer } from '../../components/consumer/CartDrawer'
import { OrderSheet } from '../../components/consumer/OrderSheet'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import { formatPrice } from '../../utils/format'
import { toast } from 'react-hot-toast'
import { useConsumerCart } from '../../hooks/useConsumerCart'
import { ArrowLeft, Plus, ShoppingCart } from 'lucide-react'

export function ConsumerMenuPage() {
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>()
  const slug = restaurantSlug ?? ''
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const branchId = searchParams.get('branchId') ?? undefined
  const { cart, cartCount, cartTotal, addLine, updateQuantity, removeLine } = useConsumerCart(slug)

  const [cartOpen, setCartOpen] = useState(false)
  const [orderItem, setOrderItem] = useState<ConsumerMenuItem | null>(null)

  const { data: restaurant } = useGetPublicConsumerRestaurantQuery(slug, { skip: !slug })
  const { data, isLoading, isError } = useGetPublicConsumerMenuQuery(
    { restaurantSlug: slug, branchId },
    { skip: !slug }
  )

  const itemHasModifiers = (item: ConsumerMenuItem) => (item.modifierGroups?.length ?? 0) > 0

  const handleAddClick = (item: ConsumerMenuItem) => {
    if (itemHasModifiers(item)) {
      setOrderItem(item)
      return
    }
    addLine({
      menuItemId: item.id,
      name: item.name,
      unitPrice: Number(item.base_price),
    })
    toast.success(`Added ${item.name}`)
  }

  const goCheckout = () => {
    if (!cart.length) {
      toast.error('Your cart is empty')
      return
    }
    navigate(branchId ? `/order/${slug}/checkout?branchId=${branchId}` : `/order/${slug}/checkout`)
  }

  if (!slug) {
    return <p className="p-6 text-muted-foreground">Restaurant slug is required.</p>
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 pb-24">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/order/${slug}`}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <p className="font-medium">{restaurant?.name ?? 'Menu'}</p>
            {cartCount > 0 && (
              <p className="text-sm text-muted-foreground">
                {cartCount} item{cartCount === 1 ? '' : 's'} · {formatPrice(cartTotal)}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setCartOpen(true)}
            aria-label="Open cart"
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {isError && (
        <p className="text-center text-muted-foreground">Unable to load menu. Try again later.</p>
      )}

      {data?.menu.categories.map((category) => (
        <section key={category.id} className="space-y-3">
          <h2 className="text-xl font-semibold">{category.name}</h2>
          {category.description && (
            <p className="text-sm text-muted-foreground">{category.description}</p>
          )}
          <div className="grid gap-3">
            {category.items.map((item) => (
              <Card key={item.id}>
                <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className="text-base">{item.name}</CardTitle>
                    {item.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                    )}
                    {itemHasModifiers(item) && (
                      <p className="mt-1 text-xs text-muted-foreground">Customizable</p>
                    )}
                  </div>
                  <Badge variant="secondary">{formatPrice(Number(item.base_price))}</Badge>
                </CardHeader>
                <CardContent>
                  <Button size="sm" onClick={() => handleAddClick(item)}>
                    <Plus className="mr-1 h-4 w-4" />
                    Add
                  </Button>
                </CardContent>
              </Card>
            ))}
            {!category.items.length && (
              <p className="text-sm text-muted-foreground">No items in this category yet.</p>
            )}
          </div>
        </section>
      ))}

      {!isLoading && !isError && !data?.menu.categories.length && (
        <p className="text-center text-muted-foreground">Menu coming soon.</p>
      )}

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t bg-background p-4">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
            <button type="button" className="text-left" onClick={() => setCartOpen(true)}>
              <p className="font-medium">{formatPrice(cartTotal)}</p>
              <p className="text-sm text-muted-foreground">{cartCount} items · View cart</p>
            </button>
            <Button onClick={goCheckout}>
              <ShoppingCart className="mr-2 h-4 w-4" />
              Checkout
            </Button>
          </div>
        </div>
      )}

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
        onAdd={(input) => {
          addLine(input)
          toast.success(`Added ${input.name}`)
        }}
      />
    </div>
  )
}

export default ConsumerMenuPage
