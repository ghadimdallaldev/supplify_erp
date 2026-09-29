import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useCreateConsumerAddressMutation,
  useDeleteConsumerAddressMutation,
  useGetConsumerAddressesQuery,
  useGetConsumerProfileQuery,
  useGetConsumerPublicOrderQuery,
  useGetConsumerPublicOrdersQuery,
  useGetConsumerReorderPreviewMutation,
  useGetGuestPublicOrderQuery,
  useGetNotificationsQuery,
  useGetPublicSalesSuppliersQuery,
  useUpdateConsumerProfileMutation,
  useUpdateConsumerAddressMutation,
} from '../../services/api'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { Skeleton } from '../../components/ui/skeleton'
import { formatPrice } from '../../utils/format'
import { toast } from 'sonner'
import { writePublicCart } from '../../lib/publicSalesCart'

export function ConsumerDiscoverPage() {
  const [q, setQ] = useState('')
  const { data, isLoading } = useGetPublicSalesSuppliersQuery({ q: q || undefined })
  return (
    <section>
      <h1 className="text-2xl font-bold">Discover suppliers</h1>
      <p className="mt-1 text-muted-foreground">
        Shop public supplier catalogs for delivery or pickup.
      </p>
      <Input
        className="mt-5"
        aria-label="Search suppliers"
        placeholder="Search suppliers"
        value={q}
        onChange={(event) => setQ(event.target.value)}
      />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-32" />)}
        {data?.suppliers.map((supplier) => (
          <Card key={supplier.id}>
            <CardHeader>
              <CardTitle>{supplier.name}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link to={`/supplier/${supplier.slug || supplier.id}`}>Shop catalog</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}

function OrderCard({
  order,
}: {
  order: {
    id: string
    reference: string
    supplierName?: string
    status: string
    total: number
    currency: string
    fulfillmentMethod: string
  }
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex justify-between gap-3">
          <span>{order.reference}</span>
          <span className="text-sm font-medium">
            {order.status === 'PLACED' ? 'Pending confirmation' : order.status}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <p>{order.supplierName}</p>
        <p>
          {order.fulfillmentMethod === 'PICKUP' && order.status === 'SHIPPED'
            ? 'Ready for pickup'
            : order.fulfillmentMethod}{' '}
          · {formatPrice(order.total)}
        </p>
      </CardContent>
    </Card>
  )
}

export function GuestOrderTrackingPage() {
  const { trackingToken = '' } = useParams()
  const { data, isLoading, isError } = useGetGuestPublicOrderQuery(trackingToken, {
    skip: !trackingToken,
  })
  if (isLoading) return <Skeleton className="h-44" />
  if (isError || !data) return <p>This tracking link is invalid or has been revoked.</p>
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Order tracking</h1>
      <OrderCard order={data} />
      <Button asChild className="mt-4">
        <Link to="/register">Create an account</Link>
      </Button>
    </section>
  )
}

export function GuestOrderReceiptPage() {
  let order = null
  try {
    order = JSON.parse(
      window.sessionStorage.getItem('supplify.public-sales.last-receipt') || 'null'
    )
  } catch {
    order = null
  }
  if (!order) return <p>This receipt is no longer available on this device.</p>
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Order receipt</h1>
      <OrderCard order={order} />
      <p className="mt-3 text-sm text-muted-foreground">
        The order was placed successfully. Because this was an idempotent replay, the secure
        tracking token cannot be reissued.
      </p>
      <Button asChild className="mt-4">
        <Link to="/register">Create an account</Link>
      </Button>
    </section>
  )
}

export function ConsumerOrdersPage() {
  const { data, isLoading } = useGetConsumerPublicOrdersQuery()
  if (isLoading) return <Skeleton className="h-44" />
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Your orders</h1>
      <div className="grid gap-4">
        {data?.orders.map((order) => (
          <Link key={order.id} to={`/shop/orders/${order.id}`}>
            <OrderCard order={order} />
          </Link>
        ))}
      </div>
      {!data?.orders.length && (
        <p className="text-muted-foreground">You have not placed any supplier orders yet.</p>
      )}
    </section>
  )
}

export function ConsumerOrderDetailPage() {
  const { orderId = '' } = useParams()
  const navigate = useNavigate()
  const { data } = useGetConsumerPublicOrderQuery(orderId, { skip: !orderId })
  const [reorder, reorderState] = useGetConsumerReorderPreviewMutation()
  if (!data) return <Skeleton className="h-44" />
  return (
    <section>
      <OrderCard order={data.order} />
      <div className="mt-4 rounded-lg border bg-background p-4">
        {data.order.items.map((item) => (
          <div key={item.productId} className="flex justify-between py-2">
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>{formatPrice(item.lineTotal)}</span>
          </div>
        ))}
      </div>
      <Button
        className="mt-4"
        disabled={reorderState.isLoading}
        onClick={async () => {
          try {
            const result = await reorder(orderId).unwrap()
            const unavailable = result.items.filter((item) => !item.available)
            const available = result.items.filter((item) => item.available && item.product)
            if (available.length && result.supplierLocationId && result.storefrontId) {
              writePublicCart({
                supplierLocationId: result.supplierLocationId,
                lines: available.map((item) => ({
                  product: item.product!,
                  quantity: item.quantity,
                  supplierLocationId: result.supplierLocationId!,
                })),
              })
              toast.info(
                unavailable.length
                  ? `Cart rebuilt with ${available.length} item(s); ${unavailable.length} unavailable item(s) were excluded.`
                  : 'Cart rebuilt using current availability and public prices.'
              )
              navigate(`/supplier/${encodeURIComponent(result.storefrontId)}`)
            } else {
              toast.info('No items from this order are currently available.')
            }
          } catch {
            toast.error('Unable to rebuild this order.')
          }
        }}
      >
        Rebuild cart
      </Button>
    </section>
  )
}

export function ConsumerAccountPage() {
  const { data } = useGetConsumerProfileQuery()
  const { data: addressData, refetch } = useGetConsumerAddressesQuery()
  const [updateProfile] = useUpdateConsumerProfileMutation()
  const [createAddress] = useCreateConsumerAddressMutation()
  const [updateAddress] = useUpdateConsumerAddressMutation()
  const [deleteAddress] = useDeleteConsumerAddressMutation()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState({
    label: 'Home',
    recipientName: '',
    phone: '',
    line1: '',
    city: '',
    country: '',
  })
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-bold">Account</h1>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <Input
            placeholder={data?.profile?.display_name || 'Name'}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            placeholder={data?.profile?.phone || 'Phone'}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <Button
            onClick={() =>
              void updateProfile({ name: name || undefined, phone: phone || undefined })
            }
          >
            Save profile
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Saved addresses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {addressData?.addresses.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border p-3"
            >
              <p>
                {item.label || 'Address'}: {item.address_json.line1}, {item.address_json.city}
                {item.is_default ? ' · Default' : ''}
              </p>
              <div className="flex gap-2">
                {!item.is_default && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      await updateAddress({ id: item.id, isDefault: true }).unwrap()
                      void refetch()
                    }}
                  >
                    Set default
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await deleteAddress(item.id).unwrap()
                    void refetch()
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="Label"
              value={address.label}
              onChange={(event) => setAddress({ ...address, label: event.target.value })}
            />
            <Input
              placeholder="Recipient"
              value={address.recipientName}
              onChange={(event) => setAddress({ ...address, recipientName: event.target.value })}
            />
            <Input
              placeholder="Phone"
              value={address.phone}
              onChange={(event) => setAddress({ ...address, phone: event.target.value })}
            />
            <Input
              placeholder="Address"
              value={address.line1}
              onChange={(event) => setAddress({ ...address, line1: event.target.value })}
            />
            <Input
              placeholder="City"
              value={address.city}
              onChange={(event) => setAddress({ ...address, city: event.target.value })}
            />
            <Input
              placeholder="Country"
              value={address.country}
              onChange={(event) => setAddress({ ...address, country: event.target.value })}
            />
          </div>
          <Button
            onClick={async () => {
              await createAddress({
                label: address.label,
                recipientName: address.recipientName,
                phone: address.phone,
                address: { line1: address.line1, city: address.city, country: address.country },
              }).unwrap()
              void refetch()
            }}
          >
            Add address
          </Button>
        </CardContent>
      </Card>
    </section>
  )
}

export function ConsumerNotificationsPage() {
  const { data, isLoading } = useGetNotificationsQuery({ page: 1, limit: 50 })
  if (isLoading) return <Skeleton className="h-44" />
  const rows = data?.notifications || data?.items || []
  return (
    <section>
      <h1 className="mb-4 text-2xl font-bold">Notifications</h1>
      <div className="space-y-3">
        {rows.map((item: { id: string; title?: string; message?: string }) => (
          <Card key={item.id}>
            <CardContent className="pt-5">
              <p className="font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.message}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  )
}
