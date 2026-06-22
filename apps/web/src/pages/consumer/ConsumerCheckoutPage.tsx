import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  useCreatePublicConsumerOrderMutation,
  useGetPublicConsumerFulfillmentOptionsQuery,
  useGetPublicConsumerStorefrontQuery,
  useGetConsumerLoyaltyPreviewQuery,
  type ConsumerFulfillmentType,
  type ConsumerOrderingStatus,
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
import { Alert, AlertDescription } from '../../components/ui/alert'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { formatPrice } from '../../utils/format'
import { toast } from 'sonner'
import {
  clearCartStorage,
  formatModifierLabels,
  cartLineTotal,
  type CartLine,
} from '../../lib/consumerCart'
import { useConsumerCart } from '../../hooks/useConsumerCart'
import { matchDeliveryZone, zoneDeliveryFee, zoneMinOrder } from '../../lib/deliveryZones'
import {
  orderingStatusFromBranch,
  toDatetimeLocalValue,
  formatMinutesToTime,
} from '../../lib/consumerOrderingHours'
import {
  ArrowLeft,
  Clock,
  Truck,
  Store,
  Utensils,
  Gift,
  AlertTriangle,
  CalendarClock,
} from 'lucide-react'
import { ensureNamespace } from '../../i18n'

function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!timeStr) return null
  const normalized = timeStr.trim()
  if (normalized === '24:00') return 1440
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function localizedOrderingMessage(
  status: ConsumerOrderingStatus,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  const startLabel = formatMinutesToTime(parseTimeToMinutes(status.liveOrderStart) ?? 12 * 60)
  const endIsMidnight = status.liveOrderEnd === '00:00' || status.liveOrderEnd === '24:00'
  const endLabel = endIsMidnight ? t('ordering.midnight') : status.liveOrderEnd

  switch (status.mode) {
    case 'LIVE':
      return t('ordering.live', { end: endLabel })
    case 'PREORDER_ONLY':
      return t('ordering.preorderOnly', { start: startLabel })
    case 'CLOSED':
      return t('ordering.closed', { start: startLabel })
    default:
      return status.message
  }
}

export function ConsumerCheckoutPage() {
  const { t } = useTranslation('consumer')

  useEffect(() => {
    void ensureNamespace('consumer')
  }, [])

  const { restaurantSlug } = useParams<{ restaurantSlug: string }>()
  const slug = restaurantSlug ?? ''
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated, member } = useConsumerAuth()
  const { cart } = useConsumerCart(slug)
  const [branchId, setBranchId] = useState(searchParams.get('branchId') ?? '')
  const [fulfillmentType, setFulfillmentType] = useState<ConsumerFulfillmentType>('TAKEAWAY')
  const [redeemPoints, setRedeemPoints] = useState(false)
  const [scheduleMode, setScheduleMode] = useState<'asap' | 'scheduled'>('asap')
  const [scheduledFor, setScheduledFor] = useState('')
  const [deliveryZoneId, setDeliveryZoneId] = useState<string | undefined>()
  const [form, setForm] = useState({
    guestName: '',
    guestEmail: '',
    guestPhone: '',
    addressLine1: '',
    city: '',
    postcode: '',
    notes: '',
  })

  const fulfillmentOptions = useMemo(
    (): Array<{
      value: ConsumerFulfillmentType
      label: string
      icon: typeof Truck
    }> => [
      { value: 'DELIVERY', label: t('fulfillment.DELIVERY'), icon: Truck },
      { value: 'TAKEAWAY', label: t('fulfillment.TAKEAWAY'), icon: Store },
      { value: 'DINE_IN', label: t('fulfillment.DINE_IN'), icon: Utensils },
    ],
    [t]
  )

  const { data: storefront } = useGetPublicConsumerStorefrontQuery(slug, { skip: !slug })
  const restaurant = storefront?.restaurant
  const { data: fulfillmentData, isLoading: loadingFulfillment } =
    useGetPublicConsumerFulfillmentOptionsQuery(
      { restaurantSlug: slug, branchId: branchId || undefined },
      { skip: !slug }
    )
  const [createOrder, { isLoading: placing }] = useCreatePublicConsumerOrderMutation()

  const branches = useMemo(
    () => fulfillmentData?.branches ?? storefront?.branches ?? [],
    [fulfillmentData?.branches, storefront?.branches]
  )
  const selectedBranch = useMemo(
    () => branches.find((b) => b.branchId === branchId) ?? branches[0],
    [branches, branchId]
  )

  const orderingStatus = useMemo(() => orderingStatusFromBranch(selectedBranch), [selectedBranch])
  const orderingMessage = useMemo(
    () => localizedOrderingMessage(orderingStatus, t),
    [orderingStatus, t]
  )

  const minScheduleValue = useMemo(() => {
    if (orderingStatus.nextLiveOrderAt) {
      return toDatetimeLocalValue(new Date(orderingStatus.nextLiveOrderAt))
    }
    return toDatetimeLocalValue(new Date())
  }, [orderingStatus.nextLiveOrderAt])

  useEffect(() => {
    if (!branchId && branches.length) {
      setBranchId(branches[0].branchId)
    }
  }, [branches, branchId])

  useEffect(() => {
    if (orderingStatus.mode === 'PREORDER_ONLY') {
      setScheduleMode('scheduled')
      if (!scheduledFor && orderingStatus.nextLiveOrderAt) {
        setScheduledFor(toDatetimeLocalValue(new Date(orderingStatus.nextLiveOrderAt)))
      }
    }
  }, [orderingStatus.mode, orderingStatus.nextLiveOrderAt, scheduledFor])

  useEffect(() => {
    if (isAuthenticated && member?.displayName && !form.guestName) {
      setForm((f) => ({ ...f, guestName: member.displayName }))
    }
  }, [form.guestName, isAuthenticated, member?.displayName])

  const matchedZone = useMemo(() => {
    if (fulfillmentType !== 'DELIVERY' || !selectedBranch) return null
    return matchDeliveryZone(selectedBranch.deliveryZones ?? [], form.postcode)
  }, [fulfillmentType, selectedBranch, form.postcode])

  useEffect(() => {
    setDeliveryZoneId(matchedZone?.id)
  }, [matchedZone?.id])

  const subtotal = cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  const minOrderAmount = useMemo(() => {
    if (!selectedBranch) return 0
    if (fulfillmentType === 'DELIVERY') {
      return zoneMinOrder(matchedZone, selectedBranch.minOrderAmount)
    }
    return selectedBranch.minOrderAmount
  }, [fulfillmentType, matchedZone, selectedBranch])

  const deliveryFee =
    fulfillmentType === 'DELIVERY'
      ? zoneDeliveryFee(matchedZone, selectedBranch?.deliveryFee ?? 0)
      : 0

  const belowMinOrder = minOrderAmount > 0 && subtotal < minOrderAmount
  const prepMinutes = selectedBranch?.estimatedPrepMinutes ?? 30

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
      toast.error(t('checkout.completeCart'))
      return
    }
    if (!form.guestName.trim()) {
      toast.error(t('checkout.nameRequired'))
      return
    }
    if (fulfillmentType === 'DELIVERY' && !form.addressLine1.trim()) {
      toast.error(t('checkout.addressRequired'))
      return
    }
    if (fulfillmentType === 'DELIVERY' && form.postcode.trim() && !matchedZone) {
      toast.error(t('checkout.postcodeNotDelivered'))
      return
    }
    if (belowMinOrder) {
      toast.error(t('checkout.minOrder', { amount: formatPrice(minOrderAmount) }))
      return
    }
    if (redeemPoints && redeemError) {
      toast.error(redeemError)
      return
    }
    if (scheduleMode === 'scheduled' && !scheduledFor) {
      toast.error(t('checkout.scheduleTimeRequired'))
      return
    }
    if (orderingStatus.mode === 'CLOSED') {
      toast.error(orderingMessage)
      return
    }
    if (orderingStatus.mode === 'PREORDER_ONLY' && scheduleMode !== 'scheduled') {
      toast.error(t('checkout.scheduleWhenOpen'))
      return
    }
    if (
      scheduleMode === 'scheduled' &&
      scheduledFor &&
      orderingStatus.nextLiveOrderAt &&
      new Date(scheduledFor) < new Date(orderingStatus.nextLiveOrderAt)
    ) {
      toast.error(t('checkout.scheduleTooEarly'))
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
        deliveryZoneId: fulfillmentType === 'DELIVERY' ? deliveryZoneId : undefined,
        scheduledFor:
          scheduleMode === 'scheduled' && scheduledFor
            ? new Date(scheduledFor).toISOString()
            : orderingStatus.mode === 'PREORDER_ONLY' && scheduledFor
              ? new Date(scheduledFor).toISOString()
              : undefined,
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
      toast.success(t('checkout.orderPlaced'))
      navigate(`/order/${slug}/receipt/${result.receiptToken ?? result.order.receipt_token}`)
    } catch (error: any) {
      toast.error(
        error?.data?.message || error?.data?.error?.message || t('checkout.unableToPlace')
      )
    }
  }

  if (!slug) {
    return <p className="p-6 text-muted-foreground">{t('common.slugRequired')}</p>
  }

  return (
    <PageShell className="space-y-4 p-4 pb-8">
      <Button variant="ghost" size="sm" asChild>
        <Link to={branchId ? `/order/${slug}/menu?branchId=${branchId}` : `/order/${slug}/menu`}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          {t('common.backToMenu')}
        </Link>
      </Button>

      <div>
        <PageHeader title={t('checkout.title')} description={restaurant?.name} />
        {prepMinutes > 0 && (
          <p className="mt-1 flex items-center gap-1 text-sm text-[var(--text-muted)]">
            <Clock className="h-3.5 w-3.5" />
            {t('checkout.estPrepTime', { minutes: prepMinutes })}
          </p>
        )}
      </div>

      {!isAuthenticated && preview?.programEnabled && (
        <Card className="border-[var(--brand-pale)] bg-[var(--brand-pale)]/30">
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <Gift className="mt-0.5 h-5 w-5 text-[var(--brand-mid)]" />
              <div>
                <p className="font-medium">
                  {t('checkout.earnRewards', {
                    points:
                      preview.earnPoints > 0
                        ? `${preview.earnPoints} ${t('common.pts')}`
                        : t('checkout.earnRewardsGeneric'),
                  })}
                </p>
                <p className="text-sm text-muted-foreground">
                  {preview.welcomeBonusPoints
                    ? t('checkout.welcomeBonus', { points: preview.welcomeBonusPoints })
                    : t('checkout.createRewardsAccount')}
                </p>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to={`/order/${slug}/account`}>{t('common.signUp')}</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!cart.length && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t('checkout.cartEmpty')}{' '}
            <Link to={`/order/${slug}/menu`} className="text-[var(--brand-mid)] underline">
              {t('checkout.browseMenu')}
            </Link>
          </CardContent>
        </Card>
      )}

      {!!cart.length && (
        <form onSubmit={handleSubmit} className="space-y-4">
          {orderingStatus.mode !== 'LIVE' && (
            <Alert
              variant={orderingStatus.mode === 'CLOSED' ? 'destructive' : 'default'}
              className={
                orderingStatus.mode === 'PREORDER_ONLY'
                  ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40'
                  : undefined
              }
            >
              <CalendarClock className="h-4 w-4" />
              <AlertDescription>{orderingMessage}</AlertDescription>
            </Alert>
          )}

          {belowMinOrder && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {t('checkout.minOrderAlert', {
                  min: formatPrice(minOrderAmount),
                  remaining: formatPrice(minOrderAmount - subtotal),
                })}
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>{t('checkout.yourOrder')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {cart.map((line: CartLine) => (
                <div key={line.cartKey} className="space-y-0.5">
                  <div className="flex justify-between text-sm">
                    <span>
                      {line.quantity}× {line.name}
                    </span>
                    <span>{formatPrice(cartLineTotal(line))}</span>
                  </div>
                  {formatModifierLabels(line) && (
                    <p className="text-xs text-muted-foreground">{formatModifierLabels(line)}</p>
                  )}
                  {line.notes && (
                    <p className="text-xs italic text-muted-foreground">
                      {t('common.note', { note: line.notes })}
                    </p>
                  )}
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 text-sm">
                <span className="text-muted-foreground">{t('common.subtotal')}</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              {deliveryFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {matchedZone
                      ? t('checkout.deliveryZone', { zone: matchedZone.name })
                      : t('common.delivery')}
                  </span>
                  <span>{formatPrice(deliveryFee)}</span>
                </div>
              )}
              {effectiveDiscount > 0 && (
                <div className="flex justify-between text-sm text-green-700 dark:text-green-400">
                  <span>{t('checkout.rewardsDiscount')}</span>
                  <span>-{formatPrice(effectiveDiscount)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2 font-medium">
                <span>
                  {t('checkout.totalCashOn', {
                    method:
                      fulfillmentType === 'DELIVERY'
                        ? t('checkout.cashOnDelivery')
                        : t('checkout.cashOnPickup'),
                  })}
                </span>
                <span>{formatPrice(effectiveTotal)}</span>
              </div>
            </CardContent>
          </Card>

          {canRedeem && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{t('checkout.useRewards')}</CardTitle>
                <CardDescription>
                  {t('checkout.rewardsBalance', {
                    balance: preview?.memberBalance ?? 0,
                    points: preview?.suggestedRedeemPoints ?? 0,
                    discount: formatPrice(preview?.suggestedDiscount ?? 0),
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-4">
                <Label htmlFor="redeem-toggle" className="flex-1 cursor-pointer">
                  {t('checkout.applyPoints')}
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
              <CardTitle>{t('common.branch')}</CardTitle>
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
                <p className="text-sm text-muted-foreground">{t('common.noBranches')}</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('checkout.fulfillment')}</CardTitle>
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
                        ? 'border-[var(--brand-mid)] bg-[var(--brand-pale)]'
                        : 'hover:bg-muted/50'
                    } ${!available ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{label}</span>
                    {!available && <Badge variant="secondary">{t('common.unavailable')}</Badge>}
                  </button>
                )
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('checkout.when')}</CardTitle>
              <CardDescription>
                {orderingStatus.mode === 'LIVE'
                  ? t('checkout.whenLive')
                  : orderingStatus.mode === 'PREORDER_ONLY'
                    ? t('checkout.whenPreorder')
                    : t('checkout.whenClosed')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {orderingStatus.allowAsap && (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={scheduleMode === 'asap' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setScheduleMode('asap')}
                  >
                    {t('checkout.asap', { minutes: prepMinutes })}
                  </Button>
                  <Button
                    type="button"
                    variant={scheduleMode === 'scheduled' ? 'default' : 'outline'}
                    className="flex-1"
                    onClick={() => setScheduleMode('scheduled')}
                  >
                    {t('checkout.schedule')}
                  </Button>
                </div>
              )}
              {(scheduleMode === 'scheduled' || !orderingStatus.allowAsap) && (
                <div className="space-y-1">
                  <Label htmlFor="scheduledFor">
                    {orderingStatus.mode === 'PREORDER_ONLY'
                      ? t('checkout.preorderFor')
                      : t('checkout.preferredTime')}
                  </Label>
                  <Input
                    id="scheduledFor"
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    min={minScheduleValue}
                    required={!orderingStatus.allowAsap}
                  />
                  {orderingStatus.nextLiveOrderAt && (
                    <p className="text-xs text-muted-foreground">
                      {t('checkout.earliest', {
                        time: new Date(orderingStatus.nextLiveOrderAt).toLocaleString(),
                      })}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('checkout.contact')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="guestName">{t('common.nameRequired')}</Label>
                <Input
                  id="guestName"
                  value={form.guestName}
                  onChange={(e) => setForm((f) => ({ ...f, guestName: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="guestEmail">{t('common.email')}</Label>
                <Input
                  id="guestEmail"
                  type="email"
                  value={form.guestEmail}
                  onChange={(e) => setForm((f) => ({ ...f, guestEmail: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="guestPhone">{t('common.phone')}</Label>
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
                <CardTitle>{t('checkout.deliveryAddress')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="addressLine1">{t('common.addressRequired')}</Label>
                  <Input
                    id="addressLine1"
                    value={form.addressLine1}
                    onChange={(e) => setForm((f) => ({ ...f, addressLine1: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor="city">{t('common.city')}</Label>
                    <Input
                      id="city"
                      value={form.city}
                      onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="postcode">{t('common.postcodeRequired')}</Label>
                    <Input
                      id="postcode"
                      value={form.postcode}
                      onChange={(e) => setForm((f) => ({ ...f, postcode: e.target.value }))}
                    />
                  </div>
                </div>
                {form.postcode.trim() && (
                  <p className="text-xs text-muted-foreground">
                    {matchedZone
                      ? t('checkout.deliveryZoneHint', {
                          zone: matchedZone.name,
                          fee: formatPrice(deliveryFee),
                        })
                      : t('checkout.postcodeHint')}
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="pt-6">
              <div className="space-y-1">
                <Label htmlFor="notes">{t('checkout.orderNotes')}</Label>
                <Textarea
                  id="notes"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            className="w-full bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
            disabled={
              placing ||
              !branchId ||
              belowMinOrder ||
              orderingStatus.mode === 'CLOSED' ||
              (fulfillmentType === 'DELIVERY' &&
                !!form.postcode.trim() &&
                !matchedZone &&
                (selectedBranch?.deliveryZones?.length ?? 0) > 0)
            }
          >
            {placing
              ? t('checkout.placingOrder')
              : t('checkout.placeOrder', { total: formatPrice(effectiveTotal) })}
          </Button>
        </form>
      )}
    </PageShell>
  )
}

export default ConsumerCheckoutPage
