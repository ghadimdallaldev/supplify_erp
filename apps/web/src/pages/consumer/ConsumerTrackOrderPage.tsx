import { FormEvent, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  useTrackPublicConsumerOrderMutation,
  type ConsumerOrderReceipt,
} from '../../services/consumerApi'
import { OrderStatusStepper } from '../../components/consumer/OrderStatusStepper'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { formatPrice } from '../../utils/format'
import { isConsumerOrderTerminal, type ConsumerOrderLine } from '../../lib/consumerOrderTracking'
import { ArrowLeft, Search } from 'lucide-react'
import { toast } from 'sonner'

function formatModifiers(line: ConsumerOrderLine): string | null {
  const modifiers = line.modifiers ?? []
  if (!modifiers.length) return null
  return modifiers
    .map((m) => m.optionName || m.groupName)
    .filter(Boolean)
    .join(', ')
}

export function ConsumerTrackOrderPage() {
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>()
  const slug = restaurantSlug ?? ''

  const [orderNumber, setOrderNumber] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [tracked, setTracked] = useState<ConsumerOrderReceipt | null>(null)

  const [trackOrder, { isLoading }] = useTrackPublicConsumerOrderMutation()

  useEffect(() => {
    if (!tracked || isConsumerOrderTerminal(tracked.order.status)) return

    const timer = window.setInterval(async () => {
      try {
        const result = await trackOrder({
          restaurantSlug: slug,
          orderNumber: tracked.order.order_number,
          email: tracked.order.guest_email || email || undefined,
          phone: tracked.order.guest_phone || phone || undefined,
        }).unwrap()
        setTracked(result)
      } catch {
        // keep last known state on poll failure
      }
    }, 5000)

    return () => window.clearInterval(timer)
  }, [tracked, slug, email, phone, trackOrder])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!slug) return
    if (!orderNumber.trim()) {
      toast.error('Enter your order number')
      return
    }
    if (!email.trim() && !phone.trim()) {
      toast.error('Enter the email or phone used at checkout')
      return
    }

    try {
      const result = await trackOrder({
        restaurantSlug: slug,
        orderNumber: orderNumber.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      }).unwrap()
      setTracked(result)
    } catch (error: any) {
      setTracked(null)
      toast.error(error?.data?.error?.message || 'Order not found')
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/order/${slug}`}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to store
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-semibold">Track your order</h1>
        <p className="text-sm text-muted-foreground">
          Enter your order number and the email or phone from checkout.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lookup</CardTitle>
          <CardDescription>We will show live status updates every few seconds.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="orderNumber">Order number</Label>
              <Input
                id="orderNumber"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder="CO-20260612-0001"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 ..."
                autoComplete="tel"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              <Search className="mr-2 h-4 w-4" />
              {isLoading ? 'Looking up…' : 'Track order'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {tracked && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tracked.order.order_number}</CardTitle>
            <CardDescription>
              {tracked.order.fulfillment_type.replace('_', ' ')} ·{' '}
              {new Date(tracked.order.created_at).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <OrderStatusStepper
              status={tracked.order.status}
              fulfillmentType={tracked.order.fulfillment_type}
            />
            <div className="space-y-3 text-sm">
              {tracked.lines.map((line) => {
                const modifierText = formatModifiers(line)
                return (
                  <div key={line.id} className="space-y-0.5">
                    <div className="flex justify-between gap-3">
                      <span>
                        {line.quantity}× {line.item_name}
                      </span>
                      <span className="shrink-0">{formatPrice(Number(line.line_total))}</span>
                    </div>
                    {modifierText && (
                      <p className="text-xs text-muted-foreground">+ {modifierText}</p>
                    )}
                  </div>
                )
              })}
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>Total</span>
                <span>{formatPrice(Number(tracked.order.total_amount))}</span>
              </div>
            </div>
            {tracked.order.receipt_token && (
              <Button asChild variant="outline" className="w-full">
                <Link to={`/order/${slug}/receipt/${tracked.order.receipt_token}`}>
                  View full receipt
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default ConsumerTrackOrderPage
