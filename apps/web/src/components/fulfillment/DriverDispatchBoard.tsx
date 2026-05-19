import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Textarea } from '../ui/textarea'
import { formatPrice } from '../../utils/format'
import { CheckCircle, Loader2, Phone, Truck } from 'lucide-react'
import toast from 'react-hot-toast'
import type { DispatchOrderCard } from '../../types'
import {
  useGetDriversQuery,
  useAssignDriverToOrderMutation,
  useReassignDriverOnOrderMutation,
  useUpdateOrderMutation,
  useSubmitOrderProofOfDeliveryMutation,
} from '../../services/api'

type DispatchData = {
  pending: DispatchOrderCard[]
  assigned: DispatchOrderCard[]
  out_for_delivery: DispatchOrderCard[]
  delivered_today: DispatchOrderCard[]
  stats: {
    pending: number
    assigned: number
    outForDelivery: number
    deliveredToday: number
  }
}

type Props = {
  data: DispatchData
  warehouseId?: string
  isLoading?: boolean
}

export function DriverDispatchBoard({ data, warehouseId, isLoading }: Props) {
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

  const [assignDriver, { isLoading: assigning }] = useAssignDriverToOrderMutation()
  const [reassignDriver, { isLoading: reassigning }] = useReassignDriverOnOrderMutation()
  const [updateOrder, { isLoading: updatingStatus }] = useUpdateOrderMutation()
  const [submitPod, { isLoading: submittingPod }] = useSubmitOrderProofOfDeliveryMutation()

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

  const advanceStatus = async (order: DispatchOrderCard, next: string) => {
    try {
      await updateOrder({
        id: order.id,
        data: { delivery_status: next as 'picked_up' | 'out_for_delivery' | 'delivered' },
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
      await updateOrder({
        id: failOrder.id,
        data: { delivery_status: 'failed', failure_reason: failureReason },
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
      await submitPod({
        orderId: podOrder.id,
        recipient_name: recipientName || undefined,
        notes: proofNotes || undefined,
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
      <div className="flex justify-center py-16">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--brand-mid)]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-4">
        <StatCard title="Unassigned" value={data.stats.pending} />
        <StatCard title="Assigned" value={data.stats.assigned} />
        <StatCard title="Out for delivery" value={data.stats.outForDelivery} />
        <StatCard title="Delivered today" value={data.stats.deliveredToday} />
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <Column title="Unassigned" count={data.pending.length}>
          {data.pending.map((order) => (
            <OrderDispatchCard
              key={order.id}
              order={order}
              actions={
                <Button size="sm" variant="outline" onClick={() => setAssignOrder(order)}>
                  + Assign Driver
                </Button>
              }
            />
          ))}
        </Column>
        <Column title="Assigned" count={data.assigned.length}>
          {data.assigned.map((order) => (
            <OrderDispatchCard key={order.id} order={order} showDriver>
              <div className="flex flex-wrap gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updatingStatus}
                  onClick={() => advanceStatus(order, 'picked_up')}
                >
                  Mark Picked Up
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
              </div>
            </OrderDispatchCard>
          ))}
        </Column>
        <Column title="Out for delivery" count={data.out_for_delivery.length}>
          {data.out_for_delivery.map((order) => (
            <OrderDispatchCard key={order.id} order={order} showDriver>
              <div className="flex flex-wrap gap-2 mt-2">
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
                      Mark Delivered
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-[var(--red)]"
                      onClick={() => setFailOrder(order)}
                    >
                      Mark Failed
                    </Button>
                  </>
                )}
              </div>
            </OrderDispatchCard>
          ))}
        </Column>
        <Column title="Delivered today" count={data.delivered_today.length}>
          {data.delivered_today.map((order) => (
            <OrderDispatchCard key={order.id} order={order} showDriver>
              <Badge
                variant="outline"
                className={
                  order.has_pod
                    ? 'mt-2 border-[var(--mint)] text-[var(--mint)]'
                    : 'mt-2 border-amber-400 text-amber-600'
                }
              >
                {order.has_pod ? 'POD on file' : 'No POD'}
              </Badge>
            </OrderDispatchCard>
          ))}
        </Column>
      </div>

      <Dialog open={!!assignOrder} onOpenChange={(o) => !o && setAssignOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign driver</DialogTitle>
          </DialogHeader>
          <Label>Driver</Label>
          <select
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            value={selectedDriverId}
            onChange={(e) => setSelectedDriverId(e.target.value)}
          >
            <option value="">Select driver…</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
                {d.vehicle_type ? ` (${d.vehicle_type})` : ''}
              </option>
            ))}
          </select>
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
          <Label>New driver</Label>
          <select
            className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            value={selectedDriverId}
            onChange={(e) => setSelectedDriverId(e.target.value)}
          >
            <option value="">Select driver…</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
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
              <Input value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
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
    </div>
  )
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className="text-2xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  )
}

function Column({
  title,
  count,
  children,
}: {
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="outline">{count}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 min-h-[200px]">
        {count === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Nothing here yet.</p>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  )
}

function OrderDispatchCard({
  order,
  showDriver,
  actions,
  children,
}: {
  order: DispatchOrderCard
  showDriver?: boolean
  actions?: React.ReactNode
  children?: React.ReactNode
}) {
  const driver = order.assignment?.driver
  return (
    <div className="rounded-lg border border-[var(--app-border)] bg-[var(--surface)] p-3">
      <p className="font-semibold text-sm">{order.restaurant_name}</p>
      <p className="text-xs text-[var(--text-muted)]">
        #{order.id.slice(0, 8).toUpperCase()} · {formatPrice(order.total_amount)} ·{' '}
        {order.item_count} items
      </p>
      {showDriver && driver && (
        <div className="mt-2 text-xs text-[var(--text-muted)] space-y-1">
          <p className="flex items-center gap-1">
            <Truck className="h-3 w-3" />
            {driver.full_name}
            {driver.vehicle_type ? ` · ${driver.vehicle_type}` : ''}
          </p>
          {driver.phone && (
            <a
              href={`tel:${driver.phone}`}
              className="flex items-center gap-1 text-[var(--brand-mid)]"
            >
              <Phone className="h-3 w-3" />
              {driver.phone}
            </a>
          )}
        </div>
      )}
      {actions}
      {children}
    </div>
  )
}
