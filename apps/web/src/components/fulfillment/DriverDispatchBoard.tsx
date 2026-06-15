import { useState } from 'react'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import { Input } from '../ui/input'
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
import { canSelectOrderForRoute } from './fulfillmentDispatchUtils'
import { toast } from 'sonner'
import type { DispatchOrderCard } from '../../types'
import { KpiCard } from '../ui/kpi-card'
import {
  useGetDriversQuery,
  useAssignDriverToOrderMutation,
  useReassignDriverOnOrderMutation,
  useUpdateOrderDeliveryStatusMutation,
  useSubmitOrderProofOfDeliveryMutation,
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
  const { can } = usePermissions()
  const canManage = can('FULFILLMENT_MANAGE') || can('DRIVER_DELIVERIES_MANAGE')
  const canPlanRoutes = can('FULFILLMENT_MANAGE')

  const { data: driversData } = useGetDriversQuery(warehouseId ? { warehouseId } : undefined)
  const drivers = driversData?.drivers ?? []

  const [assignOrder, setAssignOrder] = useState<DispatchOrderCard | null>(null)
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [reassignOrder, setReassignOrder] = useState<DispatchOrderCard | null>(null)
  const [podOrder, setPodOrder] = useState<DispatchOrderCard | null>(null)
  const [recipientName, setRecipientName] = useState('')
  const [proofNotes, setProofNotes] = useState('')
  const [failOrder, setFailOrder] = useState<DispatchOrderCard | null>(null)
  const [failureReason, setFailureReason] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [createRouteOpen, setCreateRouteOpen] = useState(false)
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null)

  const [assignDriver, { isLoading: assigning }] = useAssignDriverToOrderMutation()
  const [reassignDriver, { isLoading: reassigning }] = useReassignDriverOnOrderMutation()
  const [updateDeliveryStatus, { isLoading: updatingStatus }] =
    useUpdateOrderDeliveryStatusMutation()
  const [submitPod, { isLoading: submittingPod }] = useSubmitOrderProofOfDeliveryMutation()
  const [rolloverAssignment, { isLoading: rollingOver }] = useRolloverAssignmentToTomorrowMutation()

  const driverLabel = (d: { full_name?: string; fullName?: string }) =>
    d.full_name ?? d.fullName ?? 'Driver'

  const openTracking = (orderId: string) => setTrackingOrderId(orderId)

  const handleAssign = async () => {
    if (!assignOrder || !selectedDriverId) return
    try {
      await assignDriver({ orderId: assignOrder.id, driver_id: selectedDriverId }).unwrap()
      toast.success('Driver assigned')
      setAssignOrder(null)
      setSelectedDriverId('')
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Failed to assign driver')
    }
  }

  const handleReassign = async () => {
    if (!reassignOrder || !selectedDriverId) return
    try {
      await reassignDriver({
        orderId: reassignOrder.id,
        driver_id: selectedDriverId,
      }).unwrap()
      toast.success('Driver reassigned')
      setReassignOrder(null)
      setSelectedDriverId('')
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Failed to reassign')
    }
  }

  const moveToTomorrow = async (order: DispatchOrderCard) => {
    const assignmentId = order.assignment?.id
    if (!assignmentId) return
    try {
      await rolloverAssignment({ assignmentId }).unwrap()
      toast.success('Moved to tomorrow')
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Could not move to tomorrow')
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
      toast.success(`Marked as ${next.replace(/_/g, ' ')}`)
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Status update failed')
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
      toast.success('Marked as failed')
      setFailOrder(null)
      setFailureReason('')
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Failed to update')
    }
  }

  const handlePodSubmit = async () => {
    if (!podOrder) return
    try {
      let latitude: number | undefined
      let longitude: number | undefined
      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10_000,
              maximumAge: 60_000,
            })
          })
          latitude = pos.coords.latitude
          longitude = pos.coords.longitude
        } catch {
          /* POD allowed without GPS */
        }
      }
      await submitPod({
        orderId: podOrder.id,
        recipient_name: recipientName || undefined,
        notes: proofNotes || undefined,
        latitude,
        longitude,
      }).unwrap()
      toast.success('Proof of delivery saved')
      setPodOrder(null)
      setRecipientName('')
      setProofNotes('')
    } catch {
      toast.error('Failed to save proof')
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
        <p className="text-sm text-[var(--text-muted)]">Could not load dispatch board.</p>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onRetry}>
            Retry
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
              Create route ({selectedOrders.length})
            </Button>
            {selectedOrders.length === 0 && (
              <p className="text-xs text-[var(--text-mid)]">
                Select unassigned or assigned orders (not already on a route) to build a route.
              </p>
            )}
          </div>
        )}

        <section
          data-testid="delivery-board-stats"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6"
        >
          <KpiCard
            label="Total orders"
            value={summary.total}
            icon={Package}
            tone="brand"
            size="sm"
            testId="dispatch-stat-total"
          />
          <KpiCard
            label="Pending"
            value={summary.pending}
            icon={Clock}
            tone="warning"
            size="sm"
            description="Awaiting dispatch"
            testId="dispatch-stat-pending"
          />
          <KpiCard
            label="Out for delivery"
            value={summary.outForDelivery}
            icon={Truck}
            tone="info"
            size="sm"
            description="On the road today"
            testId="dispatch-stat-out-for-delivery"
          />
          <KpiCard
            label="Delivered"
            value={summary.delivered}
            icon={CheckCircle}
            tone="success"
            size="sm"
            description="Completed today"
            testId="dispatch-stat-delivered"
          />
          <KpiCard
            label="Failed"
            value={summary.failed}
            icon={AlertTriangle}
            tone="danger"
            size="sm"
            description="Needs follow-up"
            testId="dispatch-stat-failed"
          />
          <KpiCard
            label="Rescheduled"
            value={summary.rescheduled}
            icon={CalendarClock}
            tone="neutral"
            size="sm"
            description="Moved to a later run"
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
              {filtersActive
                ? 'No deliveries match these filters.'
                : 'No orders ready for dispatch right now.'}
            </p>
            {filtersActive && onClearFilters && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onClearFilters}
              >
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <DispatchColumn title="Unassigned" count={data.pending.length}>
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
                    selectDisabledReason={sel.ok ? undefined : sel.reason}
                    actions={
                      canManage ? (
                        <Button size="sm" variant="default" onClick={() => setAssignOrder(order)}>
                          Assign driver
                        </Button>
                      ) : undefined
                    }
                  />
                )
              })}
            </DispatchColumn>

            <DispatchColumn title="Assigned" count={data.assigned.length}>
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
                    selectDisabledReason={sel.ok ? undefined : sel.reason}
                  >
                    {canManage && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={updatingStatus}
                          onClick={() => advanceStatus(order, 'picked_up')}
                        >
                          Mark picked up
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setReassignOrder(order)
                            setSelectedDriverId('')
                          }}
                        >
                          Reassign
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={updatingStatus || rollingOver}
                          onClick={() => moveToTomorrow(order)}
                        >
                          Move to tomorrow
                        </Button>
                      </div>
                    )}
                  </DispatchOrderRow>
                )
              })}
            </DispatchColumn>

            <DispatchColumn title="Out for delivery" count={data.out_for_delivery.length}>
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
                            Rescheduled
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={updatingStatus}
                            onClick={() => advanceStatus(order, 'assigned')}
                          >
                            Ready to dispatch
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
                          Out for delivery
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
                            Mark delivered
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-[var(--red)]"
                            onClick={() => setFailOrder(order)}
                          >
                            Mark failed
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={updatingStatus || rollingOver}
                            onClick={() => moveToTomorrow(order)}
                          >
                            Move to tomorrow
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </DispatchOrderRow>
              ))}
            </DispatchColumn>

            <DispatchColumn title="Delivered today" count={data.delivered_today.length}>
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
                    {order.has_pod ? 'POD on file' : 'No POD'}
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
                  <DialogTitle>Assign driver</DialogTitle>
                </DialogHeader>
                <Label htmlFor="assign-driver-select">Driver</Label>
                <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                  <SelectTrigger id="assign-driver-select">
                    <option value="">Select driver…</option>
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
                    Cancel
                  </Button>
                  <Button onClick={handleAssign} disabled={assigning || !selectedDriverId}>
                    {assigning && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Assign
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={!!reassignOrder} onOpenChange={(o) => !o && setReassignOrder(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Reassign driver</DialogTitle>
                </DialogHeader>
                <Label htmlFor="reassign-driver-select">New driver</Label>
                <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                  <SelectTrigger id="reassign-driver-select">
                    <option value="">Select driver…</option>
                    {drivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {driverLabel(d)}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setReassignOrder(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleReassign} disabled={reassigning || !selectedDriverId}>
                    Reassign
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={!!podOrder} onOpenChange={(o) => !o && setPodOrder(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Proof of delivery (optional)</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Recipient name</Label>
                    <Input
                      value={recipientName}
                      onChange={(e) => setRecipientName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea
                      value={proofNotes}
                      onChange={(e) => setProofNotes(e.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setPodOrder(null)}>
                    Skip
                  </Button>
                  <Button onClick={handlePodSubmit} disabled={submittingPod}>
                    Save proof
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={!!failOrder} onOpenChange={(o) => !o && setFailOrder(null)}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Mark delivery failed</DialogTitle>
                </DialogHeader>
                <Label>Reason</Label>
                <Textarea
                  value={failureReason}
                  onChange={(e) => setFailureReason(e.target.value)}
                  rows={3}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setFailOrder(null)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleFail} disabled={updatingStatus}>
                    Confirm failed
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
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">Nothing here yet.</p>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
