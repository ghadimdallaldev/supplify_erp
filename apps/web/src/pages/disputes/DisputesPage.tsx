import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router-dom'
import { AppPanel } from '../../components/ui/app-panel'
import { PageShell } from '../../components/ui/page-shell'
import { PageHeader } from '../../components/ui/page-header'
import { Button } from '../../components/ui/button'
import { Badge } from '../../components/ui/badge'
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
import {
  useGetDisputesQuery,
  useGetIncomingDisputesQuery,
  useGetOrderQuery,
  useGetOrdersQuery,
  useGetSuppliersQuery,
  useReviewDisputeMutation,
  useResolveDisputeMutation,
  useRejectDisputeMutation,
  useGetEntitlementsQuery,
} from '../../services/api'
import { useImpersonation } from '../../hooks/useImpersonation'
import { usePermissions } from '../../hooks/usePermissions'
import { RequirePermission } from '../../components/RequirePermission'
import { isEntitlementFeatureEnabled } from '../../lib/planLimits'
import { isOrderEligibleForDispute } from '../../lib/orderDisputeEligibility'
import { OpenDisputeDialog } from '../../components/disputes/OpenDisputeDialog'
import {
  DisputeListCards,
  formatOrderRef,
  statusBadge,
} from '../../components/disputes/DisputeListCards'
import { TableScroll } from '../../components/ui/table-scroll'
import { EmptyState } from '../../components/ui/empty-state'
import { formatPrice } from '../../utils/format'
import { toast } from 'sonner'
import { Loader2, Scale } from 'lucide-react'
import { ensureNamespace } from '../../i18n'

type DisputeRow = {
  id: string
  orderId?: string
  order_id?: string
  type?: string
  status?: string
  disputedAmount?: number | null
  disputed_amount?: number | null
  restaurantName?: string
  restaurant_name?: string
}

export function DisputesPage() {
  const { t } = useTranslation('reports')

  useEffect(() => {
    void ensureNamespace('reports')
  }, [])

  const { isEffectiveSupplier: isSupplier } = useImpersonation()
  const { can } = usePermissions()
  const canManageSupplierDisputes = can('FULFILLMENT_MANAGE')
  const [searchParams, setSearchParams] = useSearchParams()
  const orderIdFromUrl = searchParams.get('orderId') || ''
  const supplierIdFromUrl = searchParams.get('supplierId') || ''
  const [disputeDialogOrderId, setDisputeDialogOrderId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [resolveId, setResolveId] = useState<string | null>(null)
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [resolutionType, setResolutionType] = useState('credit_note')
  const [creditAmount, setCreditAmount] = useState('')

  const [createForm, setCreateForm] = useState({
    orderId: '',
    supplierId: '',
    type: 'short_delivery',
    description: '',
    disputedAmount: '',
  })

  const { data: entitlementsData } = useGetEntitlementsQuery()
  const disputesEnabled = isEntitlementFeatureEnabled(
    entitlementsData?.entitlements,
    'disputes_returns'
  )

  const {
    data: restaurantData,
    isLoading: loadingRestaurant,
    refetch: refetchRestaurant,
  } = useGetDisputesQuery({ status: statusFilter || undefined }, { skip: isSupplier })
  const {
    data: supplierData,
    isLoading: loadingSupplier,
    refetch: refetchSupplier,
  } = useGetIncomingDisputesQuery(
    { status: statusFilter || undefined },
    { skip: !isSupplier || !can('FULFILLMENT_VIEW') }
  )

  const [reviewDispute] = useReviewDisputeMutation()
  const [resolveDispute, { isLoading: resolving }] = useResolveDisputeMutation()
  const [rejectDispute, { isLoading: rejecting }] = useRejectDisputeMutation()

  const disputes = (isSupplier ? supplierData?.disputes : restaurantData?.disputes) || []
  const isLoading = isSupplier ? loadingSupplier : loadingRestaurant
  const refetch = isSupplier ? refetchSupplier : refetchRestaurant

  const { data: orderForDispute } = useGetOrderQuery(orderIdFromUrl, {
    skip: !orderIdFromUrl || isSupplier,
  })

  const { data: ordersListData, isLoading: loadingOrders } = useGetOrdersQuery(
    { limit: 100, offset: 0 },
    { skip: isSupplier || !showCreate }
  )
  const { data: suppliersData, isLoading: loadingSuppliers } = useGetSuppliersQuery(
    { limit: 100, offset: 0 },
    { skip: isSupplier || !showCreate }
  )

  const { data: selectedOrderDetail } = useGetOrderQuery(createForm.orderId, {
    skip: !createForm.orderId || isSupplier,
  })

  const orderOptions = useMemo(() => {
    const orders = ordersListData?.orders ?? []
    return orders
      .filter((o) => isOrderEligibleForDispute(o.status))
      .map((o) => ({
        id: o.id,
        label: `${formatOrderRef(o.id)} — ${String(o.status).replace(/_/g, ' ')} — ${new Date(o.placed_at || o.created_at).toLocaleDateString()} — $${formatPrice(Number(o.total_amount || 0))}`,
      }))
  }, [ordersListData])

  const selectedOrderStatus = useMemo(() => {
    if (!createForm.orderId) return null
    if (orderForDispute?.order?.id === createForm.orderId) return orderForDispute.order.status
    if (selectedOrderDetail?.order?.id === createForm.orderId)
      return selectedOrderDetail.order.status
    return ordersListData?.orders?.find((o) => o.id === createForm.orderId)?.status ?? null
  }, [createForm.orderId, orderForDispute, selectedOrderDetail, ordersListData])

  const selectedOrderIneligible =
    Boolean(createForm.orderId) && !isOrderEligibleForDispute(selectedOrderStatus)

  const orderFromUrlIneligible =
    Boolean(orderIdFromUrl) &&
    orderForDispute?.order?.id === orderIdFromUrl &&
    !isOrderEligibleForDispute(orderForDispute.order.status)

  const suppliersForSelectedOrder = useMemo(() => {
    if (!createForm.orderId) return []
    const order =
      orderForDispute?.order?.id === createForm.orderId
        ? orderForDispute.order
        : ordersListData?.orders?.find((o) => o.id === createForm.orderId)
    const items = order?.items ?? []
    const map = new Map<string, string>()
    for (const item of items) {
      const sid = item.supplier_id
      if (sid) {
        map.set(sid, item.supplier_name || t('disputes.supplierFallback', { id: sid.slice(0, 8) }))
      }
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [createForm.orderId, orderForDispute, ordersListData, t])

  const supplierOptions = useMemo(() => {
    if (suppliersForSelectedOrder.length > 0) return suppliersForSelectedOrder
    const suppliers = suppliersData?.suppliers ?? []
    return suppliers.map((s) => ({
      id: s.id,
      name: s.name || t('disputes.supplierFallback', { id: String(s.id).slice(0, 8) }),
    }))
  }, [suppliersForSelectedOrder, suppliersData, t])

  useEffect(() => {
    if (!orderIdFromUrl || isSupplier) return
    setCreateForm((f) => ({
      ...f,
      orderId: orderIdFromUrl,
      supplierId: supplierIdFromUrl || f.supplierId,
    }))
    setDisputeDialogOrderId(orderIdFromUrl)
  }, [orderIdFromUrl, supplierIdFromUrl, isSupplier])

  useEffect(() => {
    if (!createForm.orderId) return
    const items = selectedOrderDetail?.order?.items ?? []
    const ids = [...new Set(items.map((item) => item.supplier_id).filter(Boolean) as string[])]
    if (ids.length === 1) {
      setCreateForm((f) => (f.supplierId === ids[0] ? f : { ...f, supplierId: ids[0] }))
    }
  }, [createForm.orderId, selectedOrderDetail])

  if (!disputesEnabled) {
    return (
      <PageShell className="space-y-4" data-testid="disputes-page">
        <PageHeader title={t('disputes.title')} />
        <AppPanel title={t('disputes.unavailableTitle')}>
          <p className="text-sm text-[var(--text-mid)]">{t('disputes.unavailableDescription')}</p>
        </AppPanel>
      </PageShell>
    )
  }

  const handleReview = async (id: string) => {
    try {
      await reviewDispute(id).unwrap()
      toast.success(t('disputes.toasts.markedUnderReview'))
      refetch()
    } catch {
      toast.error(t('disputes.toasts.updateFailed'))
    }
  }

  const handleResolve = async () => {
    if (!resolveId) return
    try {
      await resolveDispute({
        id: resolveId,
        body: {
          resolutionType,
          resolutionNotes: resolutionNotes || undefined,
          creditNoteAmount: creditAmount ? Number(creditAmount) : undefined,
        },
      }).unwrap()
      toast.success(t('disputes.toasts.resolved'))
      setResolveId(null)
      setResolutionNotes('')
      setCreditAmount('')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('disputes.toasts.resolveFailed'))
    }
  }

  const handleReject = async () => {
    if (!rejectId || !resolutionNotes.trim()) {
      toast.error(t('disputes.toasts.notesRequired'))
      return
    }
    try {
      await rejectDispute({ id: rejectId, resolutionNotes }).unwrap()
      toast.success(t('disputes.toasts.rejected'))
      setRejectId(null)
      setResolutionNotes('')
      refetch()
    } catch (e: unknown) {
      const err = e as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('disputes.toasts.rejectFailed'))
    }
  }

  return (
    <RequirePermission
      permission={isSupplier ? 'FULFILLMENT_VIEW' : 'ORDERS_VIEW'}
      title="disputes"
    >
      <PageShell className="space-y-4" data-testid="disputes-page">
        <PageHeader
          title={t('disputes.title')}
          description={
            isSupplier ? t('disputes.supplierDescription') : t('disputes.restaurantDescription')
          }
          actions={
            !isSupplier ? (
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  setCreateForm({
                    orderId: '',
                    supplierId: '',
                    type: 'short_delivery',
                    description: '',
                    disputedAmount: '',
                  })
                  setShowCreate(true)
                }}
              >
                {t('disputes.openDispute')}
              </Button>
            ) : undefined
          }
        />

        <AppPanel title={t('disputes.filterTitle')}>
          <div className="flex w-full max-w-md flex-col gap-2">
            <Label>{t('disputes.statusFilter')}</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="mt-1.5">
                <option value="">{t('disputes.statusAll')}</option>
                <option value="open">{t('disputes.statusOpen')}</option>
                <option value="under_review">{t('disputes.statusUnderReview')}</option>
                <option value="resolved">{t('disputes.statusResolved')}</option>
                <option value="rejected">{t('disputes.statusRejected')}</option>
              </SelectTrigger>
            </Select>
          </div>
        </AppPanel>

        <AppPanel title={isSupplier ? t('disputes.incomingTitle') : t('disputes.myDisputesTitle')}>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-[var(--text-muted)]">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--brand-mid)]" />
            </div>
          ) : disputes.length === 0 ? (
            <EmptyState
              title={t('disputes.emptyTitle')}
              description={statusFilter ? t('disputes.emptyFiltered') : t('disputes.emptyDefault')}
              icon={<Scale className="h-6 w-6" aria-hidden />}
            />
          ) : (
            <>
              <DisputeListCards
                disputes={disputes as DisputeRow[]}
                isSupplier={isSupplier}
                formatAmount={(n) => `$${formatPrice(n)}`}
                onReview={isSupplier && canManageSupplierDisputes ? handleReview : undefined}
                onResolve={
                  isSupplier && canManageSupplierDisputes ? (id) => setResolveId(id) : undefined
                }
                onReject={
                  isSupplier && canManageSupplierDisputes ? (id) => setRejectId(id) : undefined
                }
              />
              <TableScroll aria-label={t('disputes.title')} className="hidden md:block">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b bg-[var(--brand-ultra)]/40 text-left text-[var(--text-muted)]">
                      <th className="px-4 py-3 pl-5 font-medium">{t('disputes.table.order')}</th>
                      {isSupplier && (
                        <th className="px-4 py-3 font-medium">{t('disputes.table.restaurant')}</th>
                      )}
                      <th className="px-4 py-3 font-medium">{t('disputes.table.type')}</th>
                      <th className="px-4 py-3 font-medium">{t('disputes.table.status')}</th>
                      <th className="px-4 py-3 font-medium">{t('disputes.table.amount')}</th>
                      <th className="px-4 py-3 pr-5 text-right font-medium">
                        {t('disputes.table.actions')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {disputes.map((row) => {
                      const dispute = row as DisputeRow
                      const orderId = dispute.orderId || dispute.order_id
                      const disputedAmount = dispute.disputedAmount ?? dispute.disputed_amount
                      return (
                        <tr
                          key={String(dispute.id)}
                          className="border-b border-[var(--app-border)]"
                        >
                          <td className="px-4 py-3 pl-5">
                            {orderId ? (
                              <Link
                                to={`/app/orders/${orderId}`}
                                className="text-[var(--brand-mid)] hover:underline font-mono text-xs"
                              >
                                {formatOrderRef(orderId)}
                              </Link>
                            ) : (
                              <span className="text-[var(--text-muted)]">—</span>
                            )}
                          </td>
                          {isSupplier && (
                            <td className="px-4 py-3 text-sm">
                              {String(dispute.restaurantName ?? dispute.restaurant_name ?? '—')}
                            </td>
                          )}
                          <td className="px-4 py-3 capitalize">
                            <Link
                              to={`/app/disputes/${dispute.id}`}
                              className="text-[var(--brand-mid)] hover:underline"
                            >
                              {String(dispute.type || '').replace(/_/g, ' ')}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={statusBadge(String(dispute.status))}>
                              {String(dispute.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 tabular-nums">
                            {disputedAmount != null
                              ? `$${formatPrice(Number(disputedAmount))}`
                              : '—'}
                          </td>
                          <td className="px-4 py-3 pr-5 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              {isSupplier &&
                                canManageSupplierDisputes &&
                                dispute.status === 'open' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleReview(String(dispute.id))}
                                  >
                                    {t('disputes.actions.review')}
                                  </Button>
                                )}
                              {isSupplier &&
                                canManageSupplierDisputes &&
                                (dispute.status === 'open' ||
                                  dispute.status === 'under_review') && (
                                  <>
                                    <Button
                                      size="sm"
                                      onClick={() => setResolveId(String(dispute.id))}
                                    >
                                      {t('disputes.actions.resolve')}
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setRejectId(String(dispute.id))}
                                    >
                                      {t('disputes.actions.reject')}
                                    </Button>
                                  </>
                                )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </TableScroll>
            </>
          )}
        </AppPanel>

        <Dialog
          open={showCreate}
          onOpenChange={(open) => {
            setShowCreate(open)
            if (!open) {
              setCreateForm({
                orderId: '',
                supplierId: '',
                type: 'short_delivery',
                description: '',
                disputedAmount: '',
              })
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('disputes.createDialog.title')}</DialogTitle>
              <DialogDescription>{t('disputes.createDialog.description')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {(orderFromUrlIneligible || selectedOrderIneligible) && (
                <p className="text-sm text-amber-700 dark:text-amber-400 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3 py-2">
                  {t('disputes.eligibilityMessage')}
                </p>
              )}
              <div>
                <Label>{t('disputes.createDialog.order')}</Label>
                <Select
                  value={createForm.orderId}
                  onValueChange={(value) =>
                    setCreateForm((f) => ({
                      ...f,
                      orderId: value,
                      supplierId: '',
                    }))
                  }
                >
                  <SelectTrigger className="mt-1.5" disabled={loadingOrders}>
                    <option value="">
                      {loadingOrders
                        ? t('disputes.createDialog.loadingOrders')
                        : orderOptions.length === 0
                          ? t('disputes.createDialog.noEligibleOrders')
                          : t('disputes.createDialog.selectOrder')}
                    </option>
                    {orderOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>
              <div>
                <Label>{t('disputes.createDialog.supplier')}</Label>
                <Select
                  value={createForm.supplierId}
                  onValueChange={(value) => setCreateForm((f) => ({ ...f, supplierId: value }))}
                >
                  <SelectTrigger
                    className="mt-1.5"
                    disabled={!createForm.orderId || loadingSuppliers}
                  >
                    <option value="">
                      {!createForm.orderId
                        ? t('disputes.createDialog.selectOrderFirst')
                        : supplierOptions.length === 0
                          ? t('disputes.createDialog.noSuppliersOnOrder')
                          : t('disputes.createDialog.selectSupplier')}
                    </option>
                    {supplierOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>
              <p className="text-sm text-[var(--text-muted)]">
                {t('disputes.createDialog.lineItemsHint')}
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setShowCreate(false)}
              >
                {t('disputes.createDialog.cancel')}
              </Button>
              <Button
                className="w-full sm:w-auto"
                onClick={() => {
                  if (!createForm.orderId) {
                    toast.error(t('disputes.toasts.orderRequired'))
                    return
                  }
                  if (!createForm.supplierId) {
                    toast.error(t('disputes.toasts.supplierRequired'))
                    return
                  }
                  if (selectedOrderIneligible) {
                    toast.error(t('disputes.eligibilityMessage'))
                    return
                  }
                  setDisputeDialogOrderId(createForm.orderId)
                  setShowCreate(false)
                }}
                disabled={selectedOrderIneligible || !createForm.orderId || !createForm.supplierId}
              >
                {t('disputes.createDialog.continue')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(resolveId)} onOpenChange={() => setResolveId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('disputes.resolveDialog.title')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>{t('disputes.resolveDialog.resolution')}</Label>
                <Select value={resolutionType} onValueChange={setResolutionType}>
                  <SelectTrigger className="mt-1.5">
                    <option value="credit_note">{t('disputes.resolveDialog.creditNote')}</option>
                    <option value="replacement">{t('disputes.resolveDialog.replacement')}</option>
                    <option value="refund">{t('disputes.resolveDialog.refund')}</option>
                    <option value="no_action">{t('disputes.resolveDialog.noAction')}</option>
                  </SelectTrigger>
                </Select>
              </div>
              {resolutionType === 'credit_note' && (
                <div>
                  <Label>{t('disputes.resolveDialog.creditAmount')}</Label>
                  <Input
                    type="number"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                  />
                </div>
              )}
              <div>
                <Label>{t('disputes.resolveDialog.notes')}</Label>
                <Textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button className="w-full sm:w-auto" onClick={handleResolve} disabled={resolving}>
                {t('disputes.resolveDialog.confirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(rejectId)} onOpenChange={() => setRejectId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('disputes.rejectDialog.title')}</DialogTitle>
            </DialogHeader>
            <Textarea
              placeholder={t('disputes.rejectDialog.placeholder')}
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
            />
            <DialogFooter>
              <Button
                variant="destructive"
                className="w-full sm:w-auto"
                onClick={handleReject}
                disabled={rejecting}
              >
                {t('disputes.rejectDialog.reject')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {!isSupplier && disputeDialogOrderId && (
          <OpenDisputeDialog
            open={Boolean(disputeDialogOrderId)}
            onOpenChange={(open) => {
              if (!open) {
                setDisputeDialogOrderId(null)
                setSearchParams({})
              }
            }}
            orderId={disputeDialogOrderId}
            defaultSupplierId={createForm.supplierId || supplierIdFromUrl}
            onCreated={() => {
              setDisputeDialogOrderId(null)
              refetch()
            }}
          />
        )}
      </PageShell>
    </RequirePermission>
  )
}
