import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { Skeleton } from '../ui/skeleton'
import {
  CheckCircle,
  AlertTriangle,
  Loader2,
  Route,
  PackageOpen,
  Package,
  Clock,
  Truck,
  CalendarClock,
} from 'lucide-react'
import { CreateRouteDialog } from './CreateRouteDialog'
import { ProofOfDeliveryDialog } from './ProofOfDeliveryDialog'
import { canSelectOrderForRoute } from './fulfillmentDispatchUtils'
import { toast } from 'sonner'
import type { DispatchOrderCard } from '../../types'
import { KpiCard } from '../ui/kpi-card'
import {
  useGetDriversQuery,
  useAssignDriverToOrderMutation,
  useReassignDriverOnOrderMutation,
  useUpdateOrderDeliveryStatusMutation,
  useRolloverAssignmentToTomorrowMutation,
} from '../../services/api'
import { usePermissions } from '../../hooks/usePermissions'
import { DispatchOrderRow } from './DispatchOrderRow'
import { DeliveryTrackingDrawer } from './DeliveryTrackingDrawer'
import { TooltipProvider } from '../ui/tooltip'
import type { DispatchBoardData, DispatchSummaryStats } from './fulfillmentDispatchUtils'

type Props = {
  data: DispatchBoardData | null
  summary: DispatchSummaryStats
  warehouseId?: string
  isLoading?: boolean
  isError?: boolean
  filtersActive?: boolean
  onRetry?: () => void
  onClearFilters?: () => void
}

export function DriverDispatchBoard({
  data,
  summary,
  warehouseId,
  isLoading,
  isError,
  filtersActive,
  onRetry,
  onClearFilters,
}: Props) {
  const { t } = useTranslation('fulfillment')
  const { can } = usePermissions()
  const canManage = can('FULFILLMENT_MANAGE') || can('DRIVER_DELIVERIES_MANAGE')
  const canPlanRoutes = can('FULFILLMENT_MANAGE')

  const { data: driversData } = useGetDriversQuery(warehouseId ? { warehouseId } : undefined)
  const drivers = driversData?.drivers ?? []

  const [assignOrder, setAssignOrder] = useState<DispatchOrderCard | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [reassignOrder, setReassignOrder] = useState<DispatchOrderCard | null>(null)
  const [podOrder, setPodOrder] = useState<DispatchOrderCard | null>(null)
  const [failOrder, setFailOrder] = useState<DispatchOrderCard | null>(null)
  const [failureReason, setFailureReason] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [createRouteOpen, setCreateRouteOpen] = useState(false)
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null)

  const [assignDriver, { isLoading: assigning }] = useAssignDriverToOrderMutation()
  const [reassignDriver, { isLoading: reassigning }] = useReassignDriverOnOrderMutation()
  const [updateDeliveryStatus, { isLoading: updatingStatus }] =
    useUpdateOrderDeliveryStatusMutation()
  const [rolloverAssignment, { isLoading: rollingOver }] = useRolloverAssignmentToTomorrowMutation()

  const driverLabel = (d: { full_name?: string; fullName?: string }) =>
    d.full_name ?? d.fullName ?? t('dispatch.driverFallback')

  const openTracking = (orderId: string) => setTrackingOrderId(orderId)

  const handleAssign = async () => {
    if (!assignOrder || !selectedDriverId) return
    try {
      await assignDriver({ orderId: assignOrder.id, driver_id: selectedDriverId }).unwrap()
      toast.success(t('dispatch.toast.driverAssigned'))
      setAssignOrder(null)
      setSelectedDriverId('')
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('dispatch.toast.assignFailed'))
    }
  }

  const handleReassign = async () => {
    if (!reassignOrder || !selectedDriverId) return
    try {
      await reassignDriver({
        orderId: reassignOrder.id,
        driver_id: selectedDriverId,
      }).unwrap()
      toast.success(t('dispatch.toast.driverReassigned'))
      setReassignOrder(null)
      setSelectedDriverId('')
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('dispatch.toast.reassignFailed'))
    }
  }

  const moveToTomorrow = async (order: DispatchOrderCard) => {
    const assignmentId = order.assignment?.id
    if (!assignmentId) return
    try {
      await rolloverAssignment({ assignmentId }).unwrap()
      toast.success(t('dispatch.toast.movedToTomorrow'))
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('dispatch.toast.moveToTomorrowFailed'))
    }
  }

  const advanceStatus = async (order: DispatchOrderCard, next: string) => {
    try {
      await updateDeliveryStatus({
        orderId: order.id,
        status: next as 'picked_up' | 'out_for_delivery' | 'delivered' | 'rescheduled' | 'assigned',
      }).unwrap()
      if (next === 'delivered') {
        setPodOrder(order)
      }
      toast.success(t('dispatch.toast.markedAs', { status: next.replace(/_/g, ' ') }))
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('dispatch.toast.statusUpdateFailed'))
    }
  }

  const handleFail = async () => {
    if (!failOrder) return
    try {
      await updateDeliveryStatus({
        orderId: failOrder.id,
        status: 'failed',
        failure_reason: failureReason,
      }).unwrap()
      toast.success(t('dispatch.toast.markedFailed'))
      setFailOrder(null)
      setFailureReason('')
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('dispatch.toast.updateFailed'))
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4" data-testid="dispatch-board-loading">
        <Skeleton className="h-14 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div
        data-testid="dispatch-board-error"
        className="rounded-xl border border-[var(--app-border)] bg-[var(--surface)] py-12 text-center"
        role="alert"
      >
        <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-[var(--red)]" />
        <p className="text-sm text-[var(--text-muted)]">{t('dispatch.loadFailed')}</p>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            {t('common:actions.retry')}
          </Button>
        )}
      </div>
    )
  }

  if (!data) return null

  const routableOrders = [...data.pending, ...data.assigned]
  const selectedOrders = routableOrders.filter((o) => selectedIds.has(o.id))

  const toggleSelect = (order: DispatchOrderCard) => {
    const check = canSelectOrderForRoute(order)
    if (!check.ok) return
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(order.id)) next.delete(order.id)
      else next.add(order.id)
      return next
    })
  }

  const totalInView =
    data.pending.length +
    data.assigned.length +
    data.out_for_delivery.length +
    data.delivered_today.length

  const isEmpty = totalInView === 0

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {canPlanRoutes && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] px-4 py-3">
            <Button
              size="sm"
              data-testid="create-route-button"
              disabled={selectedOrders.length === 0}
              onClick={() => setCreateRouteOpen(true)}
            >
              <Route className="mr-1.5 h-4 w-4" />
              {t('dispatch.createRoute', { count: selectedOrders.length })}
            </Button>
            {selectedOrders.length === 0 && (
              <p className="text-xs text-[var(--text-mid)]">{t('dispatch.createRouteHint')}</p>
            )}
          </div>
        )}

        <section
          data-testid="delivery-board-stats"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6"
        >
          <KpiCard
            label={t('dispatch.stats.totalOrders')}
            value={summary.total}
            icon={Package}
            tone="brand"
            size="sm"
            testId="dispatch-stat-total"
          />
          <KpiCard
            label={t('dispatch.stats.pending')}
            value={summary.pending}
            icon={Clock}
            tone="warning"
            size="sm"
            description={t('dispatch.stats.pendingDescription')}
            testId="dispatch-stat-pending"
          />
          <KpiCard
            label={t('dispatch.stats.outForDelivery')}
            value={summary.outForDelivery}
            icon={Truck}
            tone="info"
            size="sm"
            description={t('dispatch.stats.outForDeliveryDescription')}
            testId="dispatch-stat-out-for-delivery"
          />
          <KpiCard
            label={t('dispatch.stats.delivered')}
            value={summary.delivered}
            icon={CheckCircle}
            tone="success"
            size="sm"
            description={t('dispatch.stats.deliveredDescription')}
            testId="dispatch-stat-delivered"
          />
          <KpiCard
            label={t('dispatch.stats.failed')}
            value={summary.failed}
            icon={AlertTriangle}
            tone="danger"
            size="sm"
            description={t('dispatch.stats.failedDescription')}
            testId="dispatch-stat-failed"
          />
          <KpiCard
            label={t('dispatch.stats.rescheduled')}
            value={summary.rescheduled}
            icon={CalendarClock}
            tone="neutral"
            size="sm"
            description={t('dispatch.stats.rescheduledDescription')}
            testId="dispatch-stat-rescheduled"
          />
        </section>

        {isEmpty ? (
          <div
            data-testid="dispatch-board-empty"
            className="rounded-xl border border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)] px-4 py-12 text-center"
          >
            <PackageOpen className="mx-auto mb-3 h-9 w-9 text-[var(--text-muted)]" aria-hidden />
            <p className="text-sm text-[var(--text-mid)]">
              {filtersActive ? t('dispatch.emptyFiltered') : t('dispatch.emptyDefault')}
            </p>
            {filtersActive && onClearFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onClearFilters}
              >
                {t('dispatch.filters.clearFilters')}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <DispatchColumn title={t('dispatch.columns.unassigned')} count={data.pending.length}>
              {data.pending.map((order) => {
                const sel = canSelectOrderForRoute(order)
                return (
                  <DispatchOrderRow
                    key={order.id}
                    order={order}
                    onViewTracking={openTracking}
                    selectable={canPlanRoutes}
                    selected={selectedIds.has(order.id)}
                    onToggleSelect={() => toggleSelect(order)}
                    selectDisabledReason={sel.ok ? undefined : t(sel.reasonKey!)}
                    actions={
                      canManage ? (
                        <Button size="sm" variant="default" onClick={() => setAssignOrder(order)}>
                          {t('dispatch.assignDriver')}
                        </Button>
                      ) : undefined
                    }
                  />
                )
              })}
            </DispatchColumn>

            <DispatchColumn title={t('dispatch.columns.assigned')} count={data.assigned.length}>
              {data.assigned.map((order) => {
                const sel = canSelectOrderForRoute(order)
                return (
                  <DispatchOrderRow
                    key={order.id}
                    order={order}
                    showDriver
                    onViewTracking={openTracking}
                    selectable={canPlanRoutes}
                    selected={selectedIds.has(order.id)}
                    onToggleSelect={() => toggleSelect(order)}
                    selectDisabledReason={sel.ok ? undefined : t(sel.reasonKey!)}
                  >
                    {canManage && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updatingStatus}
                          onClick={() => advanceStatus(order, 'picked_up')}
                        >
                          {t('dispatch.markPickedUp')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setReassignOrder(order)
                            setSelectedDriverId('')
                          }}
                        >
                          {t('dispatch.reassign')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={updatingStatus || rollingOver}
                          onClick={() => moveToTomorrow(order)}
                        >
                          {t('dispatch.moveToTomorrow')}
                        </Button>
                      </div>
                    )}
                  </DispatchOrderRow>
                )
              })}
            </DispatchColumn>

            <DispatchColumn
              title={t('dispatch.columns.outForDelivery')}
              count={data.out_for_delivery.length}
            >
              {data.out_for_delivery.map((order) => (
                <DispatchOrderRow
                  key={order.id}
                  order={order}
                  showDriver
                  onViewTracking={openTracking}
                >
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      {order.assignment?.status === 'rescheduled' && (
                        <>
                          <Badge variant="outline" className="border-amber-400 text-amber-700">
                            {t('dispatch.rescheduled')}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingStatus}
                            onClick={() => advanceStatus(order, 'assigned')}
                          >
                            {t('dispatch.readyToDispatch')}
                          </Button>
                        </>
                      )}
                      {order.assignment?.status === 'picked_up' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updatingStatus}
                          onClick={() => advanceStatus(order, 'out_for_delivery')}
                        >
                          {t('dispatch.outForDelivery')}
                        </Button>
                      )}
                      {order.assignment?.status === 'out_for_delivery' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingStatus}
                            onClick={() => advanceStatus(order, 'delivered')}
                          >
                            <CheckCircle className="mr-1 h-3 w-3" />
                            {t('dispatch.markDelivered')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[var(--red)]"
                            onClick={() => setFailOrder(order)}
                          >
                            {t('dispatch.markFailed')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={updatingStatus || rollingOver}
                            onClick={() => moveToTomorrow(order)}
                          >
                            {t('dispatch.moveToTomorrow')}
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </DispatchOrderRow>
              ))}
            </DispatchColumn>

            <DispatchColumn
              title={t('dispatch.columns.deliveredToday')}
              count={data.delivered_today.length}
            >
              {data.delivered_today.map((order) => (
                <DispatchOrderRow
                  key={order.id}
                  order={order}
                  showDriver
                  onViewTracking={openTracking}
                >
                  <Badge
                    variant="outline"
                    className={
                      order.has_pod
                        ? 'border-[var(--mint)] text-[var(--mint)]'
                        : 'border-amber-400 text-amber-600'
                    }
                  >
                    {order.has_pod ? t('dispatch.podOnFile') : t('dispatch.noPod')}
                  </Badge>
                </DispatchOrderRow>
              ))}
            </DispatchColumn>
          </div>
        )}

        <CreateRouteDialog
          open={createRouteOpen}
          onClose={() => {
            setCreateRouteOpen(false)
            setSelectedIds(new Set())
          }}
          selectedOrders={selectedOrders}
        />

        {canManage && (
          <>
            <Dialog open={!!assignOrder} onOpenChange={(o) => !o && setAssignOrder(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('dispatch.assignDialog.title')}</DialogTitle>
                </DialogHeader>
                <Label htmlFor="assign-driver-select">
                  {t('dispatch.assignDialog.driverLabel')}
                </Label>
                <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                  <SelectTrigger id="assign-driver-select">
                    <option value="">{t('dispatch.assignDialog.selectDriver')}</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {driverLabel(d)}
                        {d.vehicleType ? ` (${d.vehicleType})` : ''}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAssignOrder(null)}>
                    {t('common:actions.cancel')}
                  </Button>
                  <Button onClick={handleAssign} disabled={assigning || !selectedDriverId}>
                    {assigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('dispatch.assignDialog.assign')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={!!reassignOrder} onOpenChange={(o) => !o && setReassignOrder(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('dispatch.reassignDialog.title')}</DialogTitle>
                </DialogHeader>
                <Label htmlFor="reassign-driver-select">
                  {t('dispatch.reassignDialog.newDriverLabel')}
                </Label>
                <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                  <SelectTrigger id="reassign-driver-select">
                    <option value="">{t('dispatch.assignDialog.selectDriver')}</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {driverLabel(d)}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setReassignOrder(null)}>
                    {t('common:actions.cancel')}
                  </Button>
                  <Button onClick={handleReassign} disabled={reassigning || !selectedDriverId}>
                    {t('dispatch.reassign')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <ProofOfDeliveryDialog
              open={!!podOrder}
              orderId={podOrder?.id ?? null}
              onOpenChange={(open) => {
                if (!open) setPodOrder(null)
              }}
            />

            <Dialog open={!!failOrder} onOpenChange={(o) => !o && setFailOrder(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('dispatch.failDialog.title')}</DialogTitle>
                </DialogHeader>
                <Label>{t('dispatch.failDialog.reasonLabel')}</Label>
                <Textarea
                  value={failureReason}
                  onChange={(e) => setFailureReason(e.target.value)}
                  rows={3}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFailOrder(null)}>
                    {t('common:actions.cancel')}
                  </Button>
                  <Button variant="destructive" onClick={handleFail} disabled={updatingStatus}>
                    {t('dispatch.failDialog.confirmFailed')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}

        <DeliveryTrackingDrawer
          orderId={trackingOrderId}
          open={!!trackingOrderId}
          onOpenChange={(open) => {
            if (!open) setTrackingOrderId(null)
          }}
        />
      </div>
    </TooltipProvider>
  )
}

function DispatchColumn({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  const { t } = useTranslation('fulfillment')
  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--surface)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--app-border)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--text)]">{title}</h3>
        <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-[var(--brand-pale)] px-2 text-xs font-semibold tabular-nums text-[var(--brand-mid)]">
          {count}
        </span>
      </header>
      <div className="max-h-[min(70vh,720px)] flex-1 divide-y divide-[var(--app-border)] overflow-y-auto overflow-x-hidden">
        {count === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            {t('dispatch.columns.empty')}
          </p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
