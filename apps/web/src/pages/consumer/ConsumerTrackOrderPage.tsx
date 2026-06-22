import { FormEvent, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
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
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { ArrowLeft, Search } from 'lucide-react'
import { toast } from 'sonner'
import { ensureNamespace } from '../../i18n'

function formatModifiers(line: ConsumerOrderLine): string | null {
  const modifiers = line.modifiers ?? []
  if (!modifiers.length) return null
  return modifiers
    .map((m) => m.optionName || m.groupName)
    .filter(Boolean)
    .join(', ')
}

function fulfillmentLabel(type: string, t: TFunction<'consumer'>) {
  return t(`fulfillment.${type}`, { defaultValue: type.replace('_', ' ') })
}

export function ConsumerTrackOrderPage() {
  const { t } = useTranslation('consumer')

  useEffect(() => {
    void ensureNamespace('consumer')
  }, [])

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
      toast.error(t('track.orderNumberRequired'))
      return
    }
    if (!email.trim() && !phone.trim()) {
      toast.error(t('track.contactRequired'))
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
      toast.error(error?.data?.error?.message || t('track.orderNotFound'))
    }
  }

  return (
    <PageShell className="mx-auto max-w-lg space-y-4 p-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to={`/order/${slug}`}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.backToStore')}
        </Link>
      </Button>

      <PageHeader title={t('track.title')} description={t('track.description')} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('track.lookup')}</CardTitle>
          <CardDescription>{t('track.lookupDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="orderNumber">{t('track.orderNumber')}</Label>
              <Input
                id="orderNumber"
                value={orderNumber}
                onChange={(e) => setOrderNumber(e.target.value)}
                placeholder={t('track.orderNumberPlaceholder')}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">{t('common.email')}</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t('track.emailPlaceholder')}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">{t('common.phone')}</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t('track.phonePlaceholder')}
                autoComplete="tel"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              <Search className="mr-2 h-4 w-4" />
              {isLoading ? t('track.lookingUp') : t('track.trackOrder')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {tracked && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tracked.order.order_number}</CardTitle>
            <CardDescription>
              {fulfillmentLabel(tracked.order.fulfillment_type, t)} ·{' '}
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
                <span>{t('common.total')}</span>
                <span>{formatPrice(Number(tracked.order.total_amount))}</span>
              </div>
            </div>
            {tracked.order.receipt_token && (
              <Button asChild variant="outline" className="w-full">
                <Link to={`/order/${slug}/receipt/${tracked.order.receipt_token}`}>
                  {t('track.viewFullReceipt')}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </PageShell>
  )
}

export default ConsumerTrackOrderPage
