import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useGetConsumerAddressesQuery,
  usePlacePublicOrderMutation,
  usePreviewPublicOrderMutation,
} from '../../services/api'
import type {
  PublicDeliveryAddress,
  PublicFulfillmentMethod,
  PublicOrderPreview,
  PublicPaymentMethod,
  PublicSupplier,
} from '../../types'
import type { PublicCartLine } from '../../lib/publicSalesCart'
import { formatPrice } from '../../utils/format'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { PublicPanel } from './PublicPageLayout'

type Props = {
  idOrSlug: string
  supplier: PublicSupplier
  lines: PublicCartLine[]
  authenticatedConsumer: boolean
  onQuantity: (productId: string, quantity: number) => void
  onClear: () => void
}

function errorMessage(error: unknown) {
  return (
    (error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
    'Unable to validate this order. Please review your details and try again.'
  )
}

export function PublicSalesCheckout({
  idOrSlug,
  supplier,
  lines,
  authenticatedConsumer,
  onQuantity,
  onClear,
}: Props) {
  const sales = supplier.salesLocations?.find(
    (entry) => entry.supplierId === lines[0]?.supplierLocationId
  )
  const [fulfillmentMethod, setFulfillmentMethod] = useState<PublicFulfillmentMethod>(
    sales?.deliveryEnabled ? 'DELIVERY' : 'PICKUP'
  )
  const compatibleMethods = useMemo(
    () =>
      (sales?.paymentMethods || []).filter((method) =>
        fulfillmentMethod === 'DELIVERY'
          ? method !== 'CASH_ON_PICKUP'
          : method !== 'CASH_ON_DELIVERY'
      ),
    [sales?.paymentMethods, fulfillmentMethod]
  )
  const [paymentMethod, setPaymentMethod] = useState<PublicPaymentMethod>(
    compatibleMethods[0] || 'BANK_TRANSFER'
  )
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState<PublicDeliveryAddress>({
    line1: '',
    city: '',
    country: '',
  })
  const [whatsappConsent, setWhatsappConsent] = useState(false)
  const [preview, setPreview] = useState<PublicOrderPreview | null>(null)
  const [previewPublicOrder, previewState] = usePreviewPublicOrderMutation()
  const [placePublicOrder, placeState] = usePlacePublicOrderMutation()
  const { data: savedAddresses } = useGetConsumerAddressesQuery(undefined, {
    skip: !authenticatedConsumer,
  })
  const [selectedAddressId, setSelectedAddressId] = useState('')
  const attemptKey = useRef<string | null>(null)
  const attemptFingerprint = useRef<string | null>(null)
  const effectivePaymentMethod = compatibleMethods.includes(paymentMethod)
    ? paymentMethod
    : compatibleMethods[0] || paymentMethod

  const payload = {
    idOrSlug,
    items: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
    fulfillmentMethod,
    ...(fulfillmentMethod === 'DELIVERY' ? { deliveryAddress: address } : {}),
    paymentMethod: effectivePaymentMethod,
  }
  const checkoutFingerprint = JSON.stringify(payload)

  useEffect(() => {
    setPreview(null)
  }, [checkoutFingerprint])

  useEffect(() => {
    if (!authenticatedConsumer || selectedAddressId || !savedAddresses?.addresses.length) return
    const saved =
      savedAddresses.addresses.find((entry) => entry.is_default) || savedAddresses.addresses[0]
    setSelectedAddressId(saved.id)
    setAddress({
      ...saved.address_json,
      ...(saved.coords || {}),
    })
    setName((current) => current || saved.recipient_name)
    setPhone((current) => current || saved.phone)
  }, [authenticatedConsumer, savedAddresses, selectedAddressId])

  const validate = async () => {
    try {
      const result = await previewPublicOrder(payload).unwrap()
      setPreview(result)
    } catch (error) {
      setPreview(null)
      toast.error(errorMessage(error))
    }
  }

  const place = async () => {
    if (!preview) return
    if (!name.trim() || !phone.trim()) {
      toast.error('Name and phone are required.')
      return
    }
    const placementFingerprint = JSON.stringify({
      ...payload,
      customer: {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        whatsappConsent,
      },
    })
    if (!attemptKey.current || attemptFingerprint.current !== placementFingerprint) {
      attemptKey.current = crypto.randomUUID()
      attemptFingerprint.current = placementFingerprint
    }
    try {
      const result = await placePublicOrder({
        ...payload,
        customer: {
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim() || undefined,
          whatsappConsent,
        },
        idempotencyKey: attemptKey.current,
        authenticated: authenticatedConsumer,
      }).unwrap()
      onClear()
      attemptKey.current = null
      attemptFingerprint.current = null
      if (result.trackingToken) {
        window.sessionStorage.setItem(
          'supplify.public-sales.last-order',
          JSON.stringify({ token: result.trackingToken, reference: result.order.reference })
        )
        window.location.assign(`/order/track/${encodeURIComponent(result.trackingToken)}`)
      } else if (!authenticatedConsumer) {
        window.sessionStorage.setItem(
          'supplify.public-sales.last-receipt',
          JSON.stringify(result.order)
        )
        window.location.assign('/order/receipt')
      } else {
        window.location.assign(`/shop/orders/${result.order.id}`)
      }
    } catch (error) {
      const status = Number((error as { status?: number | string })?.status)
      if (status >= 400 && status < 500 && status !== 409) {
        attemptKey.current = null
        attemptFingerprint.current = null
      }
      toast.error(errorMessage(error))
    }
  }

  if (!lines.length) return null

  return (
    <PublicPanel className="mt-8" aria-label="Public shopping cart">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <ShoppingBag className="h-5 w-5" /> Your cart
        </h2>
        <Button variant="ghost" size="sm" onClick={onClear}>
          <Trash2 className="mr-1 h-4 w-4" /> Clear
        </Button>
      </div>

      <div className="mt-4 divide-y">
        {lines.map((line) => (
          <div key={line.product.id} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{line.product.name}</p>
              <p className="text-sm text-muted-foreground">
                {line.product.currentPrice == null ? '' : formatPrice(line.product.currentPrice)}
              </p>
            </div>
            <Button
              size="icon"
              variant="outline"
              onClick={() =>
                onQuantity(line.product.id, line.quantity - (line.product.orderMultiple || 1))
              }
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-10 text-center tabular-nums">{line.quantity}</span>
            <Button
              size="icon"
              variant="outline"
              onClick={() =>
                onQuantity(line.product.id, line.quantity + (line.product.orderMultiple || 1))
              }
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="fulfillment">Fulfillment</Label>
          <select
            id="fulfillment"
            className="mt-1 h-10 w-full rounded-md border bg-background px-3"
            value={fulfillmentMethod}
            onChange={(event) => {
              setFulfillmentMethod(event.target.value as PublicFulfillmentMethod)
              setPreview(null)
            }}
          >
            {sales?.deliveryEnabled && <option value="DELIVERY">Delivery</option>}
            {sales?.pickupEnabled && <option value="PICKUP">Pickup</option>}
          </select>
        </div>
        <div>
          <Label htmlFor="payment">Payment</Label>
          <select
            id="payment"
            className="mt-1 h-10 w-full rounded-md border bg-background px-3"
            value={effectivePaymentMethod}
            onChange={(event) => {
              setPaymentMethod(event.target.value as PublicPaymentMethod)
              setPreview(null)
            }}
          >
            {compatibleMethods.map((method) => (
              <option key={method} value={method}>
                {method.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>

      {fulfillmentMethod === 'DELIVERY' && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {authenticatedConsumer && savedAddresses?.addresses.length ? (
            <div className="sm:col-span-2">
              <Label htmlFor="saved-address">Saved address</Label>
              <select
                id="saved-address"
                className="mt-1 h-10 w-full rounded-md border bg-background px-3"
                value={selectedAddressId}
                onChange={(event) => {
                  const saved = savedAddresses.addresses.find(
                    (entry) => entry.id === event.target.value
                  )
                  setSelectedAddressId(event.target.value)
                  if (!saved) return
                  setAddress({ ...saved.address_json, ...(saved.coords || {}) })
                  setName(saved.recipient_name)
                  setPhone(saved.phone)
                }}
              >
                {savedAddresses.addresses.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.label || entry.address_json.line1}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <Input
            aria-label="Address line 1"
            placeholder="Address line 1"
            value={address.line1}
            onChange={(event) => setAddress({ ...address, line1: event.target.value })}
          />
          <Input
            aria-label="City"
            placeholder="City"
            value={address.city}
            onChange={(event) => setAddress({ ...address, city: event.target.value })}
          />
          <Input
            aria-label="Region"
            placeholder="Region"
            value={address.region || ''}
            onChange={(event) => setAddress({ ...address, region: event.target.value })}
          />
          <Input
            aria-label="Postal code"
            placeholder="Postal code"
            value={address.postalCode || ''}
            onChange={(event) => setAddress({ ...address, postalCode: event.target.value })}
          />
          <Input
            aria-label="Country"
            placeholder="Country"
            value={address.country}
            onChange={(event) => setAddress({ ...address, country: event.target.value })}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              navigator.geolocation?.getCurrentPosition(
                (position) =>
                  setAddress({
                    ...address,
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                  }),
                () => toast.error('Could not read your current location.')
              )
            }}
          >
            Use current location
          </Button>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Input
          aria-label="Customer name"
          placeholder="Full name"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          aria-label="Customer phone"
          placeholder="Phone"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
        <Input
          aria-label="Customer email"
          type="email"
          placeholder="Email (optional)"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={whatsappConsent}
          onChange={(event) => setWhatsappConsent(event.target.checked)}
        />
        Send order updates by WhatsApp when available
      </label>

      {preview && (
        <div className="mt-5 rounded-lg border bg-muted/30 p-4">
          <h3 className="font-semibold">Final summary</h3>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{formatPrice(preview.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Delivery fee</dt>
              <dd>{formatPrice(preview.deliveryFee)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Total</dt>
              <dd>{formatPrice(preview.total)}</dd>
            </div>
          </dl>
          {preview.bankTransferInstructions && (
            <p className="mt-3 text-sm">{preview.bankTransferInstructions}</p>
          )}
        </div>
      )}

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        {!authenticatedConsumer && (
          <Button asChild variant="outline">
            <Link to={`/login?redirect=${encodeURIComponent(location.pathname)}`}>Sign in</Link>
          </Button>
        )}
        <Button
          variant={preview ? 'outline' : 'default'}
          disabled={previewState.isLoading || compatibleMethods.length === 0}
          onClick={() => void validate()}
        >
          {previewState.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Review total
        </Button>
        {preview && (
          <Button disabled={placeState.isLoading} onClick={() => void place()}>
            {placeState.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Place order
          </Button>
        )}
      </div>
    </PublicPanel>
  )
}
