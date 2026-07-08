import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'
import {
  useGetDisputeQuery,
  useGetEntitlementsQuery,
  useReviewDisputeMutation,
  useResolveDisputeMutation,
  useRejectDisputeMutation,
  useCancelDisputeMutation,
} from '../../services/api'
import { useImpersonation } from '../../hooks/useImpersonation'
import { usePermissions } from '../../hooks/usePermissions'
import { RequirePermission } from '../../components/RequirePermission'
import { isEntitlementFeatureEnabled } from '../../lib/planLimits'
import { formatPrice } from '../../utils/format'
import { formatOrderRef } from '../../lib/orderPlacement'
import { PageHeader } from '../../components/ui/page-header'
import { PageShell } from '../../components/ui/page-shell'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { Input } from '../../components/ui/input'
import { Label } from '../../components/ui/label'
import { Textarea } from '../../components/ui/textarea'
import { Select, SelectTrigger } from '../../components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog'
import { TableScroll } from '../../components/ui/table-scroll'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ensureNamespace } from '../../i18n'

function statusBadge(status: string) {
  const s = status?.toLowerCase()
  if (s === 'resolved') return 'default'
  if (s === 'rejected' || s === 'cancelled') return 'destructive'
  if (s === 'under_review') return 'secondary'
  return 'outline'
}

export function DisputeDetailPage() {
  const { t } = useTranslation('disputes')
  const { id } = useParams<{ id: string }>()
  const { isEffectiveSupplier: isSupplier } = useImpersonation()
  const { can } = usePermissions()
  const canManageSupplierDisputes = can('FULFILLMENT_MANAGE')

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const disputesEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'disputes_returns'
  )

  const { data, isLoading, error, refetch } = useGetDisputeQuery(id!, { skip: !id })
  const [reviewDispute] = useReviewDisputeMutation()
  const [resolveDispute, { isLoading: resolving }] = useResolveDisputeMutation()
  const [rejectDispute, { isLoading: rejecting }] = useRejectDisputeMutation()
  const [cancelDispute, { isLoading: cancelling }] = useCancelDisputeMutation()

  const [resolveOpen, setResolveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [resolutionType, setResolutionType] = useState('credit_note')
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [creditAmount, setCreditAmount] = useState('')

  useEffect(() => {
    void ensureNamespace('disputes')
  }, [])

  if (!disputesEnabled) {
    return (
      <PageShell className="space-y-4" data-testid="dispute-detail-page">
        <PageHeader title={t('detail.title')} />
        <Card>
          <CardContent className="py-8 text-sm text-[var(--text-muted)]">
            {t('detail.notOnPlan')}
          </CardContent>
        </Card>
      </PageShell>
    )
  }

  if (isLoading) {
    return (
      <PageShell data-testid="dispute-detail-page">
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </PageShell>
    )
  }

  if (error || !data?.dispute) {
    return (
      <PageShell className="space-y-4" data-testid="dispute-detail-page">
        <PageHeader
          title={t('detail.title')}
          breadcrumb={
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/disputes">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('detail.backToDisputes')}
              </Link>
            </Button>
          }
        />
        <p className="text-[var(--red)]">{t('detail.notFound')}</p>
      </PageShell>
    )
  }

  const dispute = data.dispute as Record<string, unknown>
  const items = (data.items as Array<Record<string, unknown>>) ?? []
  const creditNotes = (data.creditNotes as Array<Record<string, unknown>>) ?? []
  const replacementOrder = data.replacementOrder as Record<string, unknown> | null | undefined
  const replacementOrderId = String(
    dispute.replacementOrderId ?? dispute.replacement_order_id ?? replacementOrder?.id ?? ''
  )
  const orderId = String(dispute.orderId ?? dispute.order_id ?? '')
  const status = String(dispute.status ?? '')
  const disputedAmount = dispute.disputedAmount ?? dispute.disputed_amount

  const handleReview = async () => {
    try {
      await reviewDispute(id!).unwrap()
      toast.success(t('detail.toast.markedUnderReview'))
      refetch()
    } catch {
      toast.error(t('detail.toast.updateFailed'))
    }
  }

  const handleResolve = async () => {
    try {
      await resolveDispute({
        id: id!,
        body: {
          resolutionType,
          resolutionNotes: resolutionNotes || undefined,
          creditNoteAmount: creditAmount ? Number(creditAmount) : undefined,
        },
      }).unwrap()
      toast.success(t('detail.toast.resolved'))
      setResolveOpen(false)
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('detail.toast.resolveFailed'))
    }
  }

  const handleReject = async () => {
    if (!resolutionNotes.trim()) {
      toast.error(t('detail.toast.rejectNotesRequired'))
      return
    }
    try {
      await rejectDispute({ id: id!, resolutionNotes }).unwrap()
      toast.success(t('detail.toast.rejected'))
      setRejectOpen(false)
      setResolutionNotes('')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('detail.toast.rejectFailed'))
    }
  }

  const handleCancel = async () => {
    try {
      await cancelDispute(id!).unwrap()
      toast.success(t('detail.toast.cancelled'))
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('detail.toast.cancelFailed'))
    }
  }

  return (
    <RequirePermission
      permission={isSupplier ? 'FULFILLMENT_VIEW' : 'ORDERS_VIEW'}
      title="dispute details"
    >
      <PageShell className="space-y-6" data-testid="dispute-detail-page">
        <PageHeader
          title={t('detail.titleDetails')}
          description={`${String(dispute.type || '').replace(/_/g, ' ')} · ${status.replace(/_/g, ' ')}`}
          breadcrumb={
            <Button variant="outline" size="sm" asChild>
              <Link to="/app/disputes">
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('detail.backToDisputes')}
              </Link>
            </Button>
          }
          actions={
            <div className="flex flex-wrap gap-2">
              {isSupplier && canManageSupplierDisputes && status === 'open' && (
                <Button size="sm" variant="outline" onClick={handleReview}>
                  {t('detail.markUnderReview')}
                </Button>
              )}
              {isSupplier &&
                canManageSupplierDisputes &&
                (status === 'open' || status === 'under_review') && (
                  <>
                    <Button size="sm" onClick={() => setResolveOpen(true)}>
                      {t('detail.resolve')}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
                      {t('detail.reject')}
                    </Button>
                  </>
                )}
              {!isSupplier && status === 'open' && (
                <Button size="sm" variant="outline" onClick={handleCancel} disabled={cancelling}>
                  {t('detail.cancelDispute')}
                </Button>
              )}
            </div>
          }
        />

        {replacementOrderId && (
          <Card className="border-sky-300 bg-sky-50/50 dark:border-sky-800 dark:bg-sky-950/20">
            <CardHeader>
              <CardTitle className="text-base">{t('detail.replacementTitle')}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-[var(--text-muted)]">{t('detail.replacementDescription')}</p>
              <Button size="sm" asChild>
                <Link to={`/app/orders/${replacementOrderId}`}>
                  {t('detail.viewReplacementOrder', {
                    ref: formatOrderRef(replacementOrderId),
                  })}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('detail.summary')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[var(--text-muted)]">{t('detail.status')}</span>
                <Badge variant={statusBadge(status)}>{status}</Badge>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[var(--text-muted)]">{t('detail.order')}</span>
                {orderId ? (
                  <Link
                    to={`/app/orders/${orderId}`}
                    className="text-[var(--brand-mid)] hover:underline font-mono"
                  >
                    {formatOrderRef(orderId)}
                  </Link>
                ) : (
                  '—'
                )}
              </div>
              {isSupplier && (
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--text-muted)]">{t('detail.restaurant')}</span>
                  <span>{String(dispute.restaurantName ?? dispute.restaurant_name ?? '—')}</span>
                </div>
              )}
              {!isSupplier && (
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--text-muted)]">{t('detail.supplier')}</span>
                  <span>{String(dispute.supplierName ?? dispute.supplier_name ?? '—')}</span>
                </div>
              )}
              {disputedAmount != null && Number(disputedAmount) > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--text-muted)]">{t('detail.disputedAmount')}</span>
                  <span>${formatPrice(Number(disputedAmount))}</span>
                </div>
              )}
              {dispute.orderStatus != null && (
                <div className="flex justify-between gap-4">
                  <span className="text-[var(--text-muted)]">{t('detail.orderStatus')}</span>
                  <span>
                    {String(dispute.orderStatus ?? dispute.order_status).replace(/_/g, ' ')}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('detail.description')}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{String(dispute.description || '—')}</p>
              {dispute.resolutionNotes != null || dispute.resolution_notes != null ? (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-[var(--text-muted)] mb-1">
                    {t('detail.resolutionNotes')}
                  </p>
                  <p className="text-sm whitespace-pre-wrap">
                    {String(dispute.resolutionNotes ?? dispute.resolution_notes)}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {items.length > 0 && (
          <Card className="overflow-visible">
            <CardHeader>
              <CardTitle className="text-base">{t('detail.lineItems')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 p-4 sm:p-6 sm:pt-0">
              <div className="space-y-2 lg:hidden">
                {items.map((item) => (
                  <div
                    key={String(item.id)}
                    className="rounded-lg border border-[var(--app-border)] p-3 text-sm"
                  >
                    <p className="font-medium">
                      {String(item.product_name ?? item.productName ?? '—')}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-[var(--text-muted)]">
                      <span>
                        {t('detail.orderedQty', {
                          qty: String(item.quantity_ordered ?? item.quantityOrdered ?? '—'),
                        })}
                      </span>
                      <span>
                        {t('detail.receivedQty', {
                          qty: String(item.quantity_received ?? item.quantityReceived ?? '—'),
                        })}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      {String(item.issue_description ?? item.issueDescription ?? '—')}
                    </p>
                  </div>
                ))}
              </div>
              <TableScroll aria-label={t('detail.lineItemsAriaLabel')} className="hidden lg:block">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--brand-ultra)]/40 text-left text-[var(--text-muted)]">
                      <th className="px-4 py-3 pl-5 font-medium">{t('detail.product')}</th>
                      <th className="hidden px-4 py-3 font-medium lg:table-cell">
                        {t('detail.ordered')}
                      </th>
                      <th className="hidden px-4 py-3 font-medium lg:table-cell">
                        {t('detail.received')}
                      </th>
                      <th className="hidden px-4 py-3 pr-5 font-medium xl:table-cell">
                        {t('detail.issue')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={String(item.id)} className="border-b border-[var(--app-border)]">
                        <td className="px-4 py-3 pl-5">
                          <div>
                            <p className="font-medium">
                              {String(item.product_name ?? item.productName ?? '—')}
                            </p>
                            <p className="mt-0.5 text-xs text-[var(--text-muted)] xl:hidden">
                              {t('detail.orderedQty', {
                                qty: String(item.quantity_ordered ?? item.quantityOrdered ?? '—'),
                              })}{' '}
                              ·{' '}
                              {t('detail.receivedQty', {
                                qty: String(item.quantity_received ?? item.quantityReceived ?? '—'),
                              })}
                            </p>
                          </div>
                        </td>
                        <td className="hidden px-4 py-3 tabular-nums lg:table-cell">
                          {String(item.quantity_ordered ?? item.quantityOrdered ?? '—')}
                        </td>
                        <td className="hidden px-4 py-3 tabular-nums lg:table-cell">
                          {String(item.quantity_received ?? item.quantityReceived ?? '—')}
                        </td>
                        <td className="hidden px-4 py-3 pr-5 text-[var(--text-muted)] xl:table-cell">
                          {String(item.issue_description ?? item.issueDescription ?? '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableScroll>
            </CardContent>
          </Card>
        )}

        {creditNotes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('detail.creditNotes')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {creditNotes.map((cn) => (
                <div
                  key={String(cn.id)}
                  className="flex justify-between border-b py-2 last:border-0"
                >
                  <span>{String(cn.credit_note_number ?? cn.creditNoteNumber ?? cn.id)}</span>
                  <span>${formatPrice(Number(cn.credit_amount ?? cn.creditAmount ?? 0))}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('detail.resolveDialog.title')}</DialogTitle>
              <DialogDescription>{t('detail.resolveDialog.description')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t('detail.resolveDialog.resolution')}</Label>
                <Select value={resolutionType} onValueChange={setResolutionType}>
                  <SelectTrigger>
                    <option value="credit_note">{t('detail.resolveDialog.creditNote')}</option>
                    <option value="replacement">{t('detail.resolveDialog.replacement')}</option>
                    <option value="refund">{t('detail.resolveDialog.refund')}</option>
                    <option value="no_action">{t('detail.resolveDialog.noAction')}</option>
                  </SelectTrigger>
                </Select>
              </div>
              {resolutionType === 'credit_note' && (
                <div>
                  <Label>{t('detail.resolveDialog.creditAmount')}</Label>
                  <Input
                    type="number"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                  />
                </div>
              )}
              <div>
                <Label>{t('detail.resolveDialog.notes')}</Label>
                <Textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleResolve} disabled={resolving}>
                {t('detail.resolveDialog.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('detail.rejectDialog.title')}</DialogTitle>
              <DialogDescription>{t('detail.rejectDialog.description')}</DialogDescription>
            </DialogHeader>
            <Textarea
              placeholder={t('detail.rejectDialog.placeholder')}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
            <DialogFooter>
              <Button variant="destructive" onClick={handleReject} disabled={rejecting}>
                {t('detail.reject')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageShell>
    </RequirePermission>
  )
}
