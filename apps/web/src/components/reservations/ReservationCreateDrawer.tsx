import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('reservations')
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
      toast.success(t('createDrawer.toasts.created'))
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
      toast.error(error?.data?.message || t('createDrawer.toasts.createFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>{t('createDrawer.trigger')}</Button>
      </DialogTrigger>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('createDrawer.title')}</DialogTitle>
          <DialogDescription>{t('createDrawer.description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs uppercase">{t('createDrawer.guestName')}</Label>
              <Input
                required
                value={form.customerName}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, customerName: event.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs uppercase">{t('createDrawer.contact')}</Label>
              <Input
                value={form.customerPhone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, customerPhone: event.target.value }))
                }
                placeholder={t('createDrawer.contactPlaceholder')}
              />
            </div>
            <div>
              <Label className="text-xs uppercase">{t('createDrawer.partySize')}</Label>
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
              <Label className="text-xs uppercase">{t('createDrawer.duration')}</Label>
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
              <Label className="text-xs uppercase">{t('createDrawer.startTime')}</Label>
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
              <Label className="text-xs uppercase">{t('createDrawer.preferredTable')}</Label>
              <Select
                value={form.tableId}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    tableId: (event.target as HTMLInputElement).value,
                  }))
                }
              >
                <SelectTrigger placeholder={t('createDrawer.autoAssign')}>
                  <option value="">{t('createDrawer.autoAssign')}</option>
                  {tables.map((table) => (
                    <SelectItem key={table.id} value={table.id}>
                      {t('createDrawer.tableOption', {
                        name: table.name,
                        capacity: table.capacity,
                      })}
                    </SelectItem>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-xs uppercase">{t('createDrawer.notes')}</Label>
            <Textarea
              rows={3}
              placeholder={t('createDrawer.notesPlaceholder')}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            />
          </div>
          <DialogFooter className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? t('createDrawer.booking') : t('createDrawer.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
