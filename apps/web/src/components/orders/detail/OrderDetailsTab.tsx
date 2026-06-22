import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  useGetOrderQuery,
  useGetOrderAmendmentsQuery,
  useGetEntitlementsQuery,
  useCreateOrderAmendmentMutation,
  useAcceptOrderAmendmentMutation,
  useRejectOrderAmendmentMutation,
  useCancelOrderAmendmentMutation,
} from '../../../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card'
import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Package, Printer, Download, Edit } from 'lucide-react'
import { isEntitlementFeatureEnabled } from '../../../lib/planLimits'
import { useImpersonation } from '../../../hooks/useImpersonation'
import { toast } from 'sonner'
import { formatPrice } from '../../../utils/format'
import {
  getOrderStatusColor,
  OrderDetailTabLoading,
  usePackingSlipActions,
} from './orderDetailShared'

export interface OrderDetailsTabProps {
  orderId: string
}

export function OrderDetailsTab({ orderId }: OrderDetailsTabProps) {
  const { t } = useTranslation('orders')
  const { isEffectiveSupplier: isSupplier } = useImpersonation()
  const { data, isLoading, refetch } = useGetOrderQuery(orderId)
  const { data: entitlementsData } = useGetEntitlementsQuery()
  const amendmentsEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'order_amendments'
  )
  const { data: amendmentsData, refetch: refetchAmendments } = useGetOrderAmendmentsQuery(orderId)
  const [createAmendment] = useCreateOrderAmendmentMutation()
  const [acceptAmendment] = useAcceptOrderAmendmentMutation()
  const [rejectAmendment] = useRejectOrderAmendmentMutation()
  const [cancelAmendment] = useCancelOrderAmendmentMutation()
  const [showAmendmentForm, setShowAmendmentForm] = useState(false)
  const [amendmentDescription, setAmendmentDescription] = useState('')
  const { downloadingPdf, printingPdf, handlePrintPackingSlip, handleDownloadPackingSlipPdf } =
    usePackingSlipActions(orderId)

  if (isLoading || !data?.order) {
    return <OrderDetailTabLoading />
  }

  const order = data.order
  const orderAny = order as Record<string, unknown>
  const promotionInfo = (orderAny.promotion || orderAny.applied_promotion) as
    | {
        promotionName?: string
        discountAmount?: number
        promotion_name?: string
        discount_amount?: number
      }
    | undefined
  const itemsSubtotal = (order.items || []).reduce((s, i) => s + Number(i.line_total || 0), 0)
  const promotionDiscount =
    Number(promotionInfo?.discountAmount ?? promotionInfo?.discount_amount) ||
    (itemsSubtotal > Number(order.total_amount) && Number(order.total_amount) > 0
      ? itemsSubtotal - Number(order.total_amount)
      : 0)
  const amendments = amendmentsData?.amendments || []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('detailsTab.orderInformation')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-[var(--text-muted)]">{t('detailsTab.orderId')}</p>
                <p className="font-medium">{order.id}</p>
              </div>
              <div>
                <p className="text-sm text-[var(--text-muted)]">{t('detailsTab.status')}</p>
                <Badge variant={getOrderStatusColor(order.status)}>
                  {t(`status.${order.status}`, { defaultValue: order.status })}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-[var(--text-muted)]">{t('detailsTab.created')}</p>
                <p className="font-medium">{new Date(order.created_at).toLocaleString()}</p>
              </div>
              {order.placed_at && (
                <div>
                  <p className="text-sm text-[var(--text-muted)]">{t('detailsTab.placed')}</p>
                  <p className="font-medium">{new Date(order.placed_at).toLocaleString()}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {order.notes && (
          <Card>
            <CardHeader>
              <CardTitle>{t('detailsTab.orderNotes')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{order.notes}</p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('detailsTab.amendments')}</CardTitle>
            {!['CANCELLED', 'COMPLETED'].includes(order.status) && amendmentsEnabled && (
              <Button size="sm" variant="outline" onClick={() => setShowAmendmentForm((v) => !v)}>
                {t('detailsTab.requestChange')}
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-3">
            {showAmendmentForm && (
              <div className="space-y-2">
                <Input
                  placeholder={t('detailsTab.amendmentPlaceholder')}
                  value={amendmentDescription}
                  onChange={(e) => setAmendmentDescription(e.target.value)}
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!amendmentDescription.trim()) {
                      toast.error(t('detailsTab.descriptionRequired'))
                      return
                    }
                    try {
                      await createAmendment({
                        orderId: order.id,
                        body: {
                          changeType: 'other',
                          description: amendmentDescription,
                        },
                      }).unwrap()
                      toast.success(t('detailsTab.amendmentRequested'))
                      setAmendmentDescription('')
                      setShowAmendmentForm(false)
                      refetchAmendments()
                    } catch (e: unknown) {
                      const err = e as { data?: { error?: { message?: string } } }
                      toast.error(err?.data?.error?.message || t('detailsTab.amendmentFailed'))
                    }
                  }}
                >
                  {t('detailsTab.submit')}
                </Button>
              </div>
            )}
            {amendments.length === 0 ? (
              <p className="text-sm text-[var(--text-muted)]">{t('detailsTab.noAmendments')}</p>
            ) : (
              amendments.map((a) => (
                <div
                  key={String(a.id)}
                  className="rounded-lg border border-[var(--app-border)] p-3 text-sm"
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-medium capitalize">
                      {String(a.change_type || a.changeType).replace(/_/g, ' ')}
                    </span>
                    <Badge variant="outline">{String(a.status)}</Badge>
                  </div>
                  <p className="text-[var(--text-muted)] mt-1">{String(a.description)}</p>
                  {a.status === 'pending' && (
                    <div className="flex gap-2 mt-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          await acceptAmendment({
                            orderId: order.id,
                            amendmentId: String(a.id),
                          }).unwrap()
                          toast.success(t('detailsTab.amendmentAccepted'))
                          refetchAmendments()
                          refetch()
                        }}
                      >
                        {t('detailsTab.accept')}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          const notes = window.prompt(t('detailsTab.rejectionNotesPrompt'))
                          if (!notes) return
                          await rejectAmendment({
                            orderId: order.id,
                            amendmentId: String(a.id),
                            responseNotes: notes,
                          }).unwrap()
                          toast.success(t('detailsTab.amendmentRejected'))
                          refetchAmendments()
                        }}
                      >
                        {t('detailsTab.reject')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          await cancelAmendment({
                            orderId: order.id,
                            amendmentId: String(a.id),
                          }).unwrap()
                          refetchAmendments()
                        }}
                      >
                        {t('detailsTab.cancel')}
                      </Button>
                    </div>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('detailsTab.orderSummary')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-muted)]">{t('detailsTab.subtotal')}</span>
              <span>
                $
                {formatPrice(
                  promotionDiscount > 0
                    ? Number(order.total_amount) + promotionDiscount
                    : order.total_amount
                )}
              </span>
            </div>
            {promotionDiscount > 0 ? (
              <div className="flex items-center justify-between text-sm text-[var(--mint)]">
                <span>
                  {promotionInfo?.promotionName || promotionInfo?.promotion_name
                    ? t('detailsTab.dealDiscountNamed', {
                        name: promotionInfo.promotionName || promotionInfo.promotion_name,
                      })
                    : t('detailsTab.dealDiscount')}
                </span>
                <span>-${formatPrice(promotionDiscount)}</span>
              </div>
            ) : null}
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-muted)]">{t('detailsTab.shipping')}</span>
              <span>$0.00</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--text-muted)]">{t('detailsTab.tax')}</span>
              <span>$0.00</span>
            </div>
            <div className="border-t pt-4">
              <div className="flex items-center justify-between font-semibold text-lg">
                <span>{t('detailsTab.total')}</span>
                <span>${formatPrice(order.total_amount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('detailsTab.quickActions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!isSupplier && (order.status === 'COMPLETED' || order.status === 'DELIVERED') && (
              <Button className="w-full" variant="default" asChild>
                <Link to={`/app/receiving?order=${order.id}`}>
                  <Package className="h-4 w-4 mr-2" />
                  {t('detailsTab.receiveThisOrder')}
                </Link>
              </Button>
            )}
            <Button
              className="w-full"
              variant="outline"
              onClick={() => handlePrintPackingSlip()}
              disabled={printingPdf}
            >
              <Printer className="h-4 w-4 mr-2" />
              {printingPdf ? t('detailsTab.preparing') : t('detailsTab.printPackingSlip')}
            </Button>
            <Button
              className="w-full"
              variant="outline"
              onClick={handleDownloadPackingSlipPdf}
              disabled={downloadingPdf}
            >
              <Download className="h-4 w-4 mr-2" />
              {downloadingPdf ? t('detailsTab.downloading') : t('detailsTab.downloadPdf')}
            </Button>
            {isSupplier && (
              <Button className="w-full" variant="outline">
                <Edit className="h-4 w-4 mr-2" />
                {t('detailsTab.addInternalNote')}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
