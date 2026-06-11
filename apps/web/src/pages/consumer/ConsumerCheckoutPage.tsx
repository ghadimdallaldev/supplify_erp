import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  useCreatePublicConsumerOrderMutation,
  useGetPublicConsumerFulfillmentOptionsQuery,
  useGetPublicConsumerRestaurantQuery,
  useGetConsumerLoyaltyPreviewQuery,
  type ConsumerFulfillmentType,
} from '../../services/consumerApi'
import { useConsumerAuth } from '../../contexts/ConsumerAuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Badge } from '../../components/ui/badge'
import { Skeleton } from '../../components/ui/skeleton'
import { Switch } from '../../components/ui/switch'
import { formatPrice } from '../../utils/format'
import { toast } from 'react-hot-toast'
import { clearCartStorage, loadCart, cartLineTotal, type CartLine } from '../../lib/consumerCart'
import { ArrowLeft, Truck, Store, Utensils, Gift } from 'lucide-react'

const fulfillmentOptions: Array<{
  value: ConsumerFulfillmentType
  label: string
  icon: typeof Truck
}> = [
  { value: 'DELIVERY', label: 'Delivery', icon: Truck },
  { value: 'TAKEAWAY', label: 'Takeaway', icon: Store },
  { value: 'DINE_IN', label: 'Dine-in', icon: Utensils },
]

export function ConsumerCheckoutPage() {
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>()
  const slug = restaurantSlug ?? ''
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated, member } = useConsumerAuth()
  const [cart] = useState<CartLine[]>(() => loadCart(slug))
  const [branchId, setBranchId] = useState(searchParams.get('branchId') ?? '')
  const [fulfillmentType, setFulfillmentType] = useState<ConsumerFulfillmentType>('TAKEAWAY')
  const [redeemPoints, setRedeemPoints] = useState(false)
  const [form, setForm] = useState({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    addressLine1: '',
    city: '',
    postcode: '',
    notes: '',
  })

  const { data: restaurant } = useGetPublicConsumerRestaurantQuery(slug, { skip: !slug })
  const { data: fulfillmentData, isLoading: loadingFulfillment } =
    useGetPublicConsumerFulfillmentOptionsQuery({ restaurantSlug: slug }, { skip: !slug })
  const [createOrder, { isLoading: placing }] = useCreatePublicConsumerOrderMutation()

  const branches = fulfillmentData?.branches ?? []
  const selectedBranch = useMemo(
    () => branches.find((b) => b.branchId === branchId) ?? branches[0],
    [branches, branchId]
  )

  useEffect(() => {
    if (!branchId && branches.length) {
      setBranchId(branches[0].branchId)
    }
  }, [branches, branchId])

  useEffect(() => {
    if (isAuthenticated && member?.displayName && !form.guestName) {
      setForm((f) => ({ ...f, guestName: member.displayName }))
    }
  }, [form.guestName, isAuthenticated, member?.displayName])

  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  const deliveryFee = fulfillmentType === 'DELIVERY' ? (selectedBranch?.deliveryFee ?? 0) : 0

  const { data: loyaltyData } = useGetConsumerLoyaltyPreviewQuery(
    {
      restaurantSlug: slug,
      subtotal,
      fulfillmentType,
    },
    { skip: !slug || !cart.length }
  )

  const preview = loyaltyData?.preview
  const pointsToRedeem =
    redeemPoints && preview?.suggestedRedeemPoints ? preview.suggestedRedeemPoints : undefined

  const { data: redeemPreviewData } = useGetConsumerLoyaltyPreviewQuery(
    {
      restaurantSlug: slug,
      subtotal,
      fulfillmentType,
      pointsToRedeem,
    },
    { skip: !slug || !cart.length || !redeemPoints || !pointsToRedeem }
  )

  const effectiveDiscount =
    redeemPoints && redeemPreviewData?.preview?.redeem?.discountValue != null
      ? redeemPreviewData.preview.redeem.discountValue
      : 0
  const effectiveTotal = Math.max(0, subtotal - effectiveDiscount + deliveryFee)
  const redeemError = redeemPreviewData?.preview?.redeem?.error

  const isFulfillmentAvailable = (type: ConsumerFulfillmentType) => {
    if (!selectedBranch) return false
    if (type === 'DELIVERY') return selectedBranch.deliveryEnabled
    if (type === 'TAKEAWAY') return selectedBranch.takeawayEnabled
    return selectedBranch.dineInEnabled
  }

  const canRedeem =
    isAuthenticated &&
    preview?.programEnabled &&
    (preview.suggestedRedeemPoints ?? 0) >= (preview.minRedeemPoints ?? 0)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!slug || !branchId || !cart.length) {
      toast.error('Complete your cart and branch selection')
      return
    }
    if (!form.guestName.trim()) {
      toast.error('Name is required')
      return
    }
    if (fulfillmentType === 'DELIVERY' && !form.addressLine1.trim()) {
      toast.error('Delivery address is required')
      return
    }
    if (redeemPoints && redeemError) {
      toast.error(redeemError)
      return
    }

    try {
      const result = await createOrder({
        restaurantSlug: slug,
        branchId,
        fulfillmentType,
        guestName: form.guestName.trim(),
        guestEmail: form.guestEmail.trim() || undefined,
        guestPhone: form.guestPhone.trim() || undefined,
        notes: form.notes.trim() || undefined,
        pointsToRedeem: redeemPoints ? pointsToRedeem : undefined,
        deliveryAddress:
          fulfillmentType === 'DELIVERY'
            ? {
                line1: form.addressLine1.trim(),
                city: form.city.trim(),
                postcode: form.postcode.trim(),
              }
            : undefined,
        lines: cart.map((line) => ({
          menuItemId: line.menuItemId,
          quantity: line.quantity,
          modifierOptionIds: line.modifierOptionIds?.length ? line.modifierOptionIds : undefined,
          notes: line.notes,
        })),
      }).unwrap()

      clearCartStorage(slug)
      toast.success('Order placed!')
      navigate(`/order/${slug}/receipt/${result.receiptToken ?? result.order.receipt_token}`)
    } catch (error: any) {
      toast.error(error?.data?.message || error?.data?.error?.message || 'Unable to place order')
    }
  }

  if (!slug) {
    return <p className="p-6 text-muted-foreground">Restaurant slug is required.</p>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <Button variant="ghost" size="sm" asChild>
        <Link to={`/order/${slug}/menu`}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to menu
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold">Checkout</h1>
        <p className="text-muted-foreground">{restaurant?.name}</p>
      </div>

      {!isAuthenticated && preview?.programEnabled && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <Gift className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">
                  Earn {preview.earnPoints > 0 ? `${preview.earnPoints} pts` : 'rewards'} on this
                  order
                </p>
                <p className="text-sm text-muted-foreground">
                  {preview.welcomeBonusPoints
                    ? `Sign up for a ${preview.welcomeBonusPoints}-point welcome bonus.`
                    : 'Create a free rewards account.'}
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to={`/order/${slug}/account`}>Sign up</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!cart.length && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Your cart is empty.{' '}
            <Link to={`/order/${slug}/menu`} className="text-primary underline">
              Browse the menu
            </Link>
          </CardContent>
        </Card>
      )}

      {!!cart.length && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Your order</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cart.map((line) => (
                <div key={line.cartKey} className="flex justify-between text-sm">
                  <span>
                    {line.quantity}× {line.name}
                    {line.notes ? ` (${line.notes})` : ''}
                  </span>
                  <span>{formatPrice(cartLineTotal(line))}</span>
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery</span>
                  <span>{formatPrice(deliveryFee)}</span>
                </div>
              )}
              {effectiveDiscount > 0 && (
                <div className="flex justify-between text-sm text-green-700 dark:text-green-400">
                  <span>Rewards discount</span>
                  <span>-{formatPrice(effectiveDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Total</span>
                <span>{formatPrice(effectiveTotal)}</span>
              </div>
              {isAuthenticated && preview?.programEnabled && preview.earnPoints > 0 && (
                <p className="text-xs text-muted-foreground">
                  You&apos;ll earn ~{preview.earnPoints} pts when this order is delivered (food
                  subtotal only).
                </p>
              )}
            </CardContent>
          </Card>

          {canRedeem && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Use rewards</CardTitle>
                <CardDescription>
                  Balance: {preview?.memberBalance ?? 0} pts · Redeem up to{' '}
                  {preview?.suggestedRedeemPoints ?? 0} pts (
                  {formatPrice(preview?.suggestedDiscount ?? 0)} off)
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <Label htmlFor="redeem-toggle" className="flex-1 cursor-pointer">
                  Apply points to this order
                </Label>
                <Switch
                  id="redeem-toggle"
                  checked={redeemPoints}
                  onCheckedChange={setRedeemPoints}
                />
              </CardContent>
              {redeemPoints && redeemError && (
                <CardContent className="pt-0 text-sm text-destructive">{redeemError}</CardContent>
              )}
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Branch</CardTitle>
              <CardDescription>Select where to prepare your order.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingFulfillment ? (
                <Skeleton className="h-10 w-full" />
              ) : branches.length ? (
                <select
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                >
                  {branches.map((branch) => (
                    <option key={branch.branchId} value={branch.branchId}>
                      {branch.branchName}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-muted-foreground">No branches configured.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Fulfillment</CardTitle>
              <CardDescription>How would you like to receive your order?</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-3">
              {fulfillmentOptions.map(({ value, label, icon: Icon }) => {
                const available = isFulfillmentAvailable(value)
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={!available}
                    onClick={() => setFulfillmentType(value)}
                    className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm transition ${
                      fulfillmentType === value
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50'
                    } ${!available ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                    {!available && <Badge variant="secondary">Unavailable</Badge>}
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="guestName">Name *</Label>
                <Input
                  id="guestName"
                  value={form.guestName}
                  onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="guestEmail">Email</Label>
                <Input
                  id="guestEmail"
                  type="email"
                  value={form.guestEmail}
                  onChange={(e) => setForm((f) => ({ ...f, guestEmail: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="guestPhone">Phone</Label>
                <Input
                  id="guestPhone"
                  value={form.guestPhone}
                  onChange={(e) => setForm((f) => ({ ...f, guestPhone: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          {fulfillmentType === 'DELIVERY' && (
            <Card>
              <CardHeader>
                <CardTitle>Delivery address</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="addressLine1">Address *</Label>
                  <Input
                    id="addressLine1"
                    value={form.addressLine1}
                    onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="postcode">Postcode</Label>
                    <Input
                      id="postcode"
                      value={form.postcode}
                      onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-1">
                <Label htmlFor="notes">Order notes</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full" disabled={placing || !branchId}>
            {placing ? 'Placing order…' : `Place order · ${formatPrice(effectiveTotal)}`}
          </Button>
        </form>
      )}
    </div>
  )
}

export default ConsumerCheckoutPage
