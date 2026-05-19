import { useState } from 'react'
import toast from 'react-hot-toast'
import { Loader2, Truck, Plus } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import type { DriverRecord } from '../../types'
import {
  useGetDriversQuery,
  useGetWarehousesQuery,
  useCreateDriverMutation,
  useUpdateDriverMutation,
  useDeactivateDriverMutation,
} from '../../services/api'

const VEHICLE_TYPES = ['motorcycle', 'van', 'truck', 'car', 'other'] as const

type DriverForm = {
  full_name: string
  phone: string
  vehicle_type: string
  vehicle_plate: string
  warehouse_id: string
  notes: string
}

const emptyForm = (): DriverForm => ({
  full_name: '',
  phone: '',
  vehicle_type: 'van',
  vehicle_plate: '',
  warehouse_id: '',
  notes: '',
})

export function DriversSettingsPanel() {
  const { data, isLoading, refetch } = useGetDriversQuery()
  const { data: warehousesData } = useGetWarehousesQuery()
  const [createDriver, { isLoading: creating }] = useCreateDriverMutation()
  const [updateDriver, { isLoading: updating }] = useUpdateDriverMutation()
  const [deactivateDriver] = useDeactivateDriverMutation()

  const drivers = data?.drivers ?? []
  const warehouses = warehousesData?.warehouses ?? []

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<DriverRecord | null>(null)
  const [form, setForm] = useState<DriverForm>(emptyForm())

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (driver: DriverRecord) => {
    setEditing(driver)
    setForm({
      full_name: driver.full_name,
      phone: driver.phone ?? '',
      vehicle_type: driver.vehicle_type ?? 'van',
      vehicle_plate: driver.vehicle_plate ?? '',
      warehouse_id: driver.warehouse_id ?? '',
      notes: driver.notes ?? '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      toast.error('Name is required')
      return
    }
    try {
      const body = {
        full_name: form.full_name.trim(),
        phone: form.phone || null,
        vehicle_type: form.vehicle_type || null,
        vehicle_plate: form.vehicle_plate || null,
        warehouse_id: form.warehouse_id || null,
        notes: form.notes || null,
      }
      if (editing) {
        await updateDriver({ id: editing.id, data: body }).unwrap()
        toast.success('Driver updated')
      } else {
        await createDriver(body).unwrap()
        toast.success('Driver added')
      }
      setModalOpen(false)
      refetch()
    } catch {
      toast.error('Failed to save driver')
    }
  }

  const handleDeactivate = async (driver: DriverRecord) => {
    if (!confirm(`Deactivate ${driver.full_name}?`)) return
    try {
      await deactivateDriver(driver.id).unwrap()
      toast.success('Driver deactivated')
      refetch()
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'data' in err
          ? (err as { data?: { error?: { message?: string } } }).data?.error?.message
          : 'Cannot deactivate driver'
      toast.error(message || 'Cannot deactivate driver')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              Drivers
            </CardTitle>
            <CardDescription>
              Manage delivery drivers for dispatch and order assignment.
            </CardDescription>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" />
            Add driver
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-mid)]" />
          </div>
        ) : drivers.length === 0 ? (
          <p className="text-center py-8 text-[var(--text-muted)]">
            No drivers yet. Add your first driver to start assigning deliveries.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {drivers.map((driver) => (
              <div
                key={driver.id}
                className="rounded-lg border border-[var(--app-border)] p-4 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{driver.full_name}</p>
                    {driver.phone && (
                      <p className="text-sm text-[var(--text-muted)]">{driver.phone}</p>
                    )}
                    <p className="text-xs text-[var(--text-muted)]">
                      {[driver.vehicle_type, driver.vehicle_plate].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {driver.warehouse_name && (
                    <Badge variant="outline">{driver.warehouse_name}</Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(driver)}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDeactivate(driver)}>
                    Deactivate
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit driver' : 'Add driver'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="full_name">Full name</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="vehicle_type">Vehicle type</Label>
              <select
                id="vehicle_type"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                value={form.vehicle_type}
                onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}
              >
                {VEHICLE_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="vehicle_plate">Plate</Label>
              <Input
                id="vehicle_plate"
                value={form.vehicle_plate}
                onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })}
              />
            </div>
            {warehouses.length > 0 && (
              <div>
                <Label htmlFor="warehouse_id">Home warehouse</Label>
                <select
                  id="warehouse_id"
                  className="w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                  value={form.warehouse_id}
                  onChange={(e) => setForm({ ...form, warehouse_id: e.target.value })}
                >
                  <option value="">— None —</option>
                  {warehouses.map((w: { id: string; name: string }) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={creating || updating}>
              {(creating || updating) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
