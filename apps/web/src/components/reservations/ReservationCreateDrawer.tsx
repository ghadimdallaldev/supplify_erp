import { useState } from 'react'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Select, SelectItem, SelectTrigger } from '../ui/select'
import { toast } from 'sonner'
import { useCreateReservationMutation } from '../../services/reservationsApi'
import type { ReservationTable } from '../../types'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog'

interface ReservationCreateDrawerProps {
  tables: ReservationTable[]
  branchId?: string
  onCreated?: () => void
}

const DEFAULT_DURATION = 90

export function ReservationCreateDrawer({
  tables,
  branchId,
  onCreated,
}: ReservationCreateDrawerProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    partySize: 2,
    scheduledAt: new Date().toISOString().slice(0, 16),
    durationMinutes: DEFAULT_DURATION,
    notes: '',
    tableId: '',
  })

  const [createReservation, { isLoading }] = useCreateReservationMutation()

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    try {
      await createReservation({
        customerName: form.customerName,
        customerPhone: form.customerPhone,
        partySize: Number(form.partySize),
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMinutes: Number(form.durationMinutes),
        branchId,
        notes: form.notes,
        tableIds: form.tableId ? [form.tableId] : [],
      }).unwrap()
      toast.success('Reservation created')
      setOpen(false)
      setForm({
        customerName: '',
        customerPhone: '',
        partySize: 2,
        scheduledAt: new Date().toISOString().slice(0, 16),
        durationMinutes: DEFAULT_DURATION,
        notes: '',
        tableId: '',
      })
      onCreated?.()
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to create reservation')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>+ New reservation</Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Capture reservation</DialogTitle>
          <DialogDescription>
            Log the essentials and let Supplify handle the capacity math for you.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs uppercase">Guest name</Label>
              <Input
                required
                value={form.customerName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, customerName: event.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs uppercase">Contact</Label>
              <Input
                value={form.customerPhone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, customerPhone: event.target.value }))
                }
                placeholder="+971..."
              />
            </div>
            <div>
              <Label className="text-xs uppercase">Party size</Label>
              <Input
                type="number"
                min={1}
                value={form.partySize}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, partySize: Number(event.target.value) }))
                }
              />
            </div>
            <div>
              <Label className="text-xs uppercase">Duration (min)</Label>
              <Input
                type="number"
                min={30}
                max={240}
                value={form.durationMinutes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, durationMinutes: Number(event.target.value) }))
                }
              />
            </div>
            <div>
              <Label className="text-xs uppercase">Start time</Label>
              <Input
                type="datetime-local"
                required
                value={form.scheduledAt}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, scheduledAt: event.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs uppercase">Preferred table</Label>
              <Select
                value={form.tableId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    tableId: (event.target as HTMLInputElement).value,
                  }))
                }
              >
                <SelectTrigger placeholder="Auto assign">
                  <option value="">Auto assign</option>
                  {tables.map((table) => (
                    <SelectItem key={table.id} value={table.id}>
                      {table.name} • {table.capacity} seats
                    </SelectItem>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase">Notes</Label>
            <Textarea
              rows={3}
              placeholder="Birthday cake? VIP? Allergies?"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </div>
          <DialogFooter className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Booking…' : 'Confirm reservation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
