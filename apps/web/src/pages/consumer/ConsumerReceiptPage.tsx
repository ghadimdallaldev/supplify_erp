import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useGetPublicConsumerReceiptQuery } from '../../services/consumerApi'
import { OrderStatusStepper } from '../../components/consumer/OrderStatusStepper'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Button } from '../../components/ui/button'
import { Skeleton } from '../../components/ui/skeleton'
import { formatPrice } from '../../utils/format'
import { isConsumerOrderTerminal, type ConsumerOrderLine } from '../../lib/consumerOrderTracking'
import { CheckCircle2, Gift } from 'lucide-react'

function formatModifiers(line: ConsumerOrderLine): string | null {
  const modifiers = line.modifiers ?? []
  if (!modifiers.length) return null
  return modifiers
    .map((m) => m.optionName || m.groupName)
    .filter(Boolean)
    .join(', ')
}

export function ConsumerReceiptPage() {
  const { restaurantSlug, receiptToken } = useParams<{
    restaurantSlug: string
    receiptToken: string
  }>()

  const [pollMs, setPollMs] = useState(5000)

  const { data, isLoading, isError } = useGetPublicConsumerReceiptQuery(
    { restaurantSlug: restaurantSlug ?? '', receiptToken: receiptToken ?? '' },
    {
      skip: !restaurantSlug || !receiptToken,
      pollingInterval: pollMs,
    }
  )

  useEffect(() => {
    const status = data?.order?.status
    setPollMs(status && !isConsumerOrderTerminal(status) ? 5000 : 0)
  }, [data?.order?.status])

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (isError || !data?.order) {
    return (
      <div className="mx-auto max-w-lg p-6 text-center text-muted-foreground">
        Receipt not found.
      </div>
    )
  }

  const { order, lines, loyalty } = data
  const delivered = order.status === 'DELIVERED'
  const pointsEarned = loyalty?.pointsEarned
  const showEarnBanner = delivered && pointsEarned != null && pointsEarned > 0

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <div className="text-center">
        <CheckCircle2
          className={`mx-auto mb-2 h-10 w-10 ${delivered ? 'text-green-600' : 'text-primary'}`}
        />
        <h1 className="text-2xl font-semibold">
          {delivered ? 'Order delivered' : 'Order confirmed'}
        </h1>
        <p className="text-muted-foreground">{order.order_number}</p>
      </div>

      {showEarnBanner && (
        <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/40">
          <CardContent className="flex items-center gap-3 pt-6">
            <Gift className="h-8 w-8 shrink-0 text-green-700 dark:text-green-400" />
            <div>
              <p className="font-medium text-green-900 dark:text-green-100">
                +{pointsEarned} rewards points earned!
              </p>
              <p className="text-sm text-green-800/80 dark:text-green-200/80">
                Points are added to your rewards balance when the order is delivered.
              </p>
              <Button
                asChild
                variant="link"
                className="mt-1 h-auto p-0 text-green-800 dark:text-green-300"
              >
                <Link to={`/order/${restaurantSlug}/rewards`}>View my rewards →</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Order status</CardTitle>
        </CardHeader>
        <CardContent>
          <OrderStatusStepper status={order.status} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Fulfillment</span>
            <span>{order.fulfillment_type.replace('_', ' ')}</span>
          </div>
          {lines.map((line) => {
            const modifierText = formatModifiers(line)
            return (
              <div key={line.id} className="space-y-0.5">
                <div className="flex justify-between gap-3">
                  <span>
                    {line.quantity}× {line.item_name}
                  </span>
                  <span className="shrink-0">{formatPrice(Number(line.line_total))}</span>
                </div>
                {modifierText && <p className="text-xs text-muted-foreground">+ {modifierText}</p>}
                {line.notes && (
                  <p className="text-xs italic text-muted-foreground">Note: {line.notes}</p>
                )}
              </div>
            )
          })}
          {Number(order.delivery_fee) > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Delivery</span>
              <span>{formatPrice(Number(order.delivery_fee))}</span>
            </div>
          )}
          {loyalty && loyalty.discountAmount > 0 && (
            <div className="flex justify-between text-green-700 dark:text-green-400">
              <span>Rewards discount</span>
              <span>-{formatPrice(loyalty.discountAmount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 font-medium">
            <span>Total</span>
            <span>{formatPrice(Number(order.total_amount))}</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild variant="outline" className="flex-1">
          <Link to={`/order/${restaurantSlug}/track`}>Track another order</Link>
        </Button>
        <Button asChild className="flex-1">
          <Link to={`/order/${restaurantSlug}`}>Back to store</Link>
        </Button>
      </div>
    </div>
  )
}

export default ConsumerReceiptPage
