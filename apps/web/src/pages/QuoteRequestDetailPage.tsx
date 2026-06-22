import { useEffect, useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import { ensureNamespace } from '../i18n'

function responseStatusLabel(status: string, t: (key: string) => string) {
  switch (status) {
    case 'pending':
      return t('status.pending')
    case 'responded':
      return t('status.responded')
    case 'declined':
      return t('status.declined')
    default:
      return status
  }
}

export function QuoteRequestDetailPage() {
  const { t } = useTranslation('quotes')

  useEffect(() => {
    void ensureNamespace('quotes')
  }, [])

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
      toast.success(t('detail.addedToCart'))
      navigate('/app/cart')
    } catch (err: any) {
      toast.error(err?.data?.error?.message || t('detail.addToCartFailed'))
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
          title={t('detail.notFoundTitle')}
          description={t('detail.notFoundDescription')}
          action={
            <Button variant="outline" onClick={() => refetch()}>
              {t('common.retry')}
            </Button>
          }
        />
      </PageShell>
    )
  }

  const { quoteRequest, items, suppliers } = data

  const headerDescription = [
    t('detail.createdAt', { date: new Date(quoteRequest.createdAt).toLocaleString() }),
    quoteRequest.neededBy ? t('detail.neededBy', { date: quoteRequest.neededBy }) : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <PageShell className="space-y-6" data-testid="quote-request-detail-page">
      <PageHeader
        title={t('detail.title')}
        description={headerDescription}
        breadcrumb={
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link to="/app/quote-requests">
              <ArrowLeft className="h-4 w-4 mr-1" />
              {t('detail.backToRequests')}
            </Link>
          </Button>
        }
        actions={
          <Badge>{quoteRequest.status === 'open' ? t('status.open') : quoteRequest.status}</Badge>
        }
      />

      {quoteRequest.note && <p className="text-sm text-[var(--text)]">{quoteRequest.note}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('detail.requestedItemsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-[var(--text-muted)]">
                <th className="py-2 pr-4">{t('common.product')}</th>
                <th className="py-2 pr-4">{t('common.qty')}</th>
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
        <EmptyState title={t('detail.waitingTitle')} description={t('detail.waitingDescription')} />
      ) : (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('detail.responsesTitle')}</h2>
          {suppliers.map((supplier) => (
            <Card key={supplier.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{supplier.supplierName}</CardTitle>
                    {supplier.supplierSlug && (
                      <CardDescription>
                        <Link to={`/supplier/${supplier.supplierSlug}`} className="hover:underline">
                          {t('detail.viewCatalog')}
                        </Link>
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={supplier.status === 'responded' ? 'default' : 'secondary'}>
                      {responseStatusLabel(supplier.status, t)}
                    </Badge>
                    {supplier.status === 'responded' && (
                      <Button
                        size="sm"
                        disabled={converting}
                        onClick={() => handleAddToCart(supplier)}
                      >
                        <ShoppingCart className="h-4 w-4 mr-1" />
                        {t('detail.addToCart')}
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
                        <th className="py-2 pr-3">{t('detail.item')}</th>
                        <th className="py-2 pr-3">{t('detail.available')}</th>
                        <th className="py-2 pr-3">{t('detail.price')}</th>
                        <th className="py-2 pr-3">{t('common.qty')}</th>
                        <th className="py-2 pr-3">{t('detail.delivery')}</th>
                        <th className="py-2 pr-3">{t('detail.note')}</th>
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
                              {line
                                ? line.isAvailable
                                  ? t('common.yes')
                                  : t('common.no')
                                : t('common.emDash')}
                            </td>
                            <td className="py-2 pr-3">
                              {line?.unitPrice != null
                                ? formatPrice(line.unitPrice)
                                : t('common.emDash')}
                            </td>
                            <td className="py-2 pr-3">{line?.quantity ?? t('common.emDash')}</td>
                            <td className="py-2 pr-3">
                              {line?.deliveryDate ?? t('common.emDash')}
                            </td>
                            <td className="py-2 pr-3 max-w-[160px] truncate">
                              {line?.substituteProductName
                                ? t('detail.substitute', { name: line.substituteProductName })
                                : line?.note || t('common.emDash')}
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
