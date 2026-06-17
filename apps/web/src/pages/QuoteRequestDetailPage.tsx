import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  useGetQuoteRequestCompareQuery,
  useConvertQuoteResponseToCartMutation,
} from '../services/api'
import { useCartActions } from '../hooks/useCartActions'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import { PageHeader } from '../components/ui/page-header'
import { PageShell } from '../components/ui/page-shell'
import { formatPrice } from '../utils/format'
import { toast } from 'sonner'
import { ArrowLeft, ShoppingCart } from 'lucide-react'
import type { QuoteRequestSupplierEntry } from '../types'

function responseStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'responded':
      return 'Responded'
    case 'declined':
      return 'Declined'
    default:
      return status
  }
}

export function QuoteRequestDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { addItem } = useCartActions()
  const { data, isLoading, isError, refetch } = useGetQuoteRequestCompareQuery(id!, { skip: !id })
  const [convertToCart, { isLoading: converting }] = useConvertQuoteResponseToCartMutation()

  const handleAddToCart = async (supplier: QuoteRequestSupplierEntry) => {
    if (!id || supplier.status !== 'responded') return
    try {
      const payload = await convertToCart({
        quoteRequestId: id,
        supplierRowId: supplier.id,
      }).unwrap()
      for (const line of payload.items) {
        addItem({
          productId: line.productId,
          quantity: line.quantity,
          quotedUnitPrice: line.quotedUnitPrice ?? undefined,
          quoteRequestSupplierId: payload.quoteRequestSupplierId,
          quoteResponseItemId: line.quoteResponseItemId,
          product: {
            ...line.product,
            current_price: line.quotedUnitPrice ?? line.product.current_price,
          },
        })
      }
      toast.success('Added to cart')
      navigate('/app/cart')
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Could not add to cart')
    }
  }

  const respondedSuppliers = useMemo(
    () => data?.suppliers.filter((s) => s.status === 'responded') ?? [],
    [data]
  )

  if (isLoading) {
    return (
      <PageShell className="space-y-4" data-testid="quote-request-detail-page">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </PageShell>
    )
  }

  if (isError || !data) {
    return (
      <PageShell data-testid="quote-request-detail-page">
        <EmptyState
          title="Quote request not found"
          description="This request may have been removed or you do not have access."
          action={
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
          }
        />
      </PageShell>
    )
  }

  const { quoteRequest, items, suppliers } = data

  const headerDescription = [
    `Created ${new Date(quoteRequest.createdAt).toLocaleString()}`,
    quoteRequest.neededBy ? `Needed by ${quoteRequest.neededBy}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <PageShell className="space-y-6" data-testid="quote-request-detail-page">
      <PageHeader
        title="Compare offers"
        description={headerDescription}
        breadcrumb={
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link to="/app/quote-requests">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back to quote requests
            </Link>
          </Button>
        }
        actions={<Badge>{quoteRequest.status === 'open' ? 'Open' : quoteRequest.status}</Badge>}
      />

      {quoteRequest.note && <p className="text-sm text-[var(--text)]">{quoteRequest.note}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Requested items</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[var(--text-muted)]">
                <th className="py-2 pr-4">Product</th>
                <th className="py-2 pr-4">Qty</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-[var(--app-border)]">
                  <td className="py-2 pr-4">
                    <span className="font-medium">{item.productName}</span>
                    <span className="text-[var(--text-muted)] ml-2">{item.productSku}</span>
                  </td>
                  <td className="py-2 pr-4">
                    {item.quantity} {item.productUnit || item.unit || ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {respondedSuppliers.length === 0 ? (
        <EmptyState
          title="Waiting for supplier responses"
          description="Suppliers will be notified. Check back when responses arrive."
        />
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Supplier responses</h2>
          {suppliers.map((supplier) => (
            <Card key={supplier.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{supplier.supplierName}</CardTitle>
                    {supplier.supplierSlug && (
                      <CardDescription>
                        <Link to={`/supplier/${supplier.supplierSlug}`} className="hover:underline">
                          View catalog
                        </Link>
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={supplier.status === 'responded' ? 'default' : 'secondary'}>
                      {responseStatusLabel(supplier.status)}
                    </Badge>
                    {supplier.status === 'responded' && (
                      <Button
                        size="sm"
                        disabled={converting}
                        onClick={() => handleAddToCart(supplier)}
                      >
                        <ShoppingCart className="h-4 w-4 mr-1" />
                        Add to cart
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              {supplier.response && (
                <CardContent className="overflow-x-auto">
                  {supplier.response.note && (
                    <p className="text-sm text-[var(--text-muted)] mb-3">
                      {supplier.response.note}
                    </p>
                  )}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-[var(--text-muted)]">
                        <th className="py-2 pr-3">Item</th>
                        <th className="py-2 pr-3">Available</th>
                        <th className="py-2 pr-3">Price</th>
                        <th className="py-2 pr-3">Qty</th>
                        <th className="py-2 pr-3">Delivery</th>
                        <th className="py-2 pr-3">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((reqItem) => {
                        const line = supplier.response?.items.find(
                          (ri) => ri.quoteRequestItemId === reqItem.id
                        )
                        return (
                          <tr key={reqItem.id} className="border-b border-[var(--app-border)]">
                            <td className="py-2 pr-3">{reqItem.productName}</td>
                            <td className="py-2 pr-3">
                              {line ? (line.isAvailable ? 'Yes' : 'No') : '—'}
                            </td>
                            <td className="py-2 pr-3">
                              {line?.unitPrice != null ? formatPrice(line.unitPrice) : '—'}
                            </td>
                            <td className="py-2 pr-3">{line?.quantity ?? '—'}</td>
                            <td className="py-2 pr-3">{line?.deliveryDate ?? '—'}</td>
                            <td className="py-2 pr-3 max-w-[160px] truncate">
                              {line?.substituteProductName
                                ? `Substitute: ${line.substituteProductName}`
                                : line?.note || '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  )
}
