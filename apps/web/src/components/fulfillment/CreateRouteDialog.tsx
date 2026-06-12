import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import type { DispatchOrderCard } from '../../types'
import { useCreateFulfillmentRouteMutation, useGetDriversQuery } from '../../services/api'
import { formatOrderRef } from './fulfillmentDispatchUtils'

type Props = {
  open: boolean
  onClose: () => void
  selectedOrders: DispatchOrderCard[]
}

export function CreateRouteDialog({ open, onClose, selectedOrders }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [driverId, setDriverId] = useState('')
  const [scheduledDate, setScheduledDate] = useState(today)
  const [routeLabel, setRouteLabel] = useState('')
  const [area, setArea] = useState('')

  const {
    data: driversData,
    isLoading: driversLoading,
    isError: driversError,
  } = useGetDriversQuery({
    active: true,
  })
  const [createRoute, { isLoading }] = useCreateFulfillmentRouteMutation()
  const drivers = driversData?.drivers ?? []

  const handleCreate = async () => {
    if (!driverId) {
      toast.error('Select a driver')
      return
    }
    try {
      await createRoute({
        order_ids: selectedOrders.map((o) => o.id),
        driver_id: driverId,
        scheduled_date: scheduledDate,
        route_label: routeLabel.trim() || undefined,
        area: area.trim() || undefined,
      }).unwrap()
      toast.success('Planned route created')
      onClose()
      setDriverId('')
      setRouteLabel('')
      setArea('')
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || 'Failed to create route')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Assign to planned route</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--text-muted)]">
          {selectedOrders.length} order{selectedOrders.length === 1 ? '' : 's'} will be added to a{' '}
          <strong>planned</strong> route and assigned to the selected driver. Activate the route
          from Fulfillment → Routes when orders are ready for dispatch.
        </p>
        <ul className="max-h-32 overflow-y-auto rounded-md border border-[var(--app-border)] p-2 text-xs space-y-1">
          {selectedOrders.map((o) => (
            <li key={o.id}>
              {o.restaurant_name} · {formatOrderRef(o.id)}
            </li>
          ))}
        </ul>
        <div className="space-y-3">
          <div>
            <Label htmlFor="route-driver">Driver</Label>
            {driversLoading ? (
              <p
                className="mt-1 text-sm text-[var(--text-muted)]"
                data-testid="create-route-drivers-loading"
              >
                Loading drivers…
              </p>
            ) : driversError ? (
              <p
                className="mt-1 text-sm text-red-600"
                data-testid="create-route-drivers-error"
                role="alert"
              >
                Could not load drivers. Try again.
              </p>
            ) : (
              <Select value={driverId} onValueChange={setDriverId}>
                <SelectTrigger
                  id="route-driver"
                  data-testid="create-route-driver"
                  className="mt-1"
                  disabled={drivers.length === 0}
                >
                  <option value="">
                    {drivers.length === 0 ? 'No active drivers' : 'Select driver…'}
                  </option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.fullName ?? (d as { full_name?: string }).full_name}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            )}
          </div>
          <div>
            <Label htmlFor="route-date">Route date</Label>
            <Input
              id="route-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="route-label">Route name (optional)</Label>
            <Input
              id="route-label"
              placeholder="e.g. Downtown morning run"
              value={routeLabel}
              onChange={(e) => setRouteLabel(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="route-area">Area (optional)</Label>
            <Input
              id="route-area"
              placeholder="e.g. Downtown"
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            data-testid="create-route-submit"
            onClick={handleCreate}
            disabled={isLoading || !driverId}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create route
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
