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
    customerEmail: '',
    partySize: 2,
    scheduledAt: new Date().toISOString().slice(0, 16),
    durationMinutes: DEFAULT_DURATION,
    notes: '',
    occasion: '',
    allergies: '',
    bookingSource: 'staff' as 'staff' | 'walk_in',
    tableId: '',
  })

  const [createReservation, { isLoading }] = useCreateReservationMutation()

  const resetForm = () =>
    setForm({
      customerName: '',
      customerPhone: '',
      customerEmail: '',
      partySize: 2,
      scheduledAt: new Date().toISOString().slice(0, 16),
      durationMinutes: DEFAULT_DURATION,
      notes: '',
      occasion: '',
      allergies: '',
      bookingSource: 'staff',
      tableId: '',
    })

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    try {
      await createReservation({
        customerName: form.customerName,
        customerPhone: form.customerPhone || undefined,
        customerEmail: form.customerEmail || undefined,
        partySize: Number(form.partySize),
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMinutes: Number(form.durationMinutes),
        branchId,
        notes: form.notes || undefined,
        occasion: form.occasion || undefined,
        allergies: form.allergies || undefined,
        bookingSource: form.bookingSource,
        tableIds: form.tableId ? [form.tableId] : [],
      }).unwrap()
      toast.success(t('createDrawer.toasts.created'))
      setOpen(false)
      resetForm()
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
              <Label className="text-xs uppercase">
                {t('createDrawer.email', { defaultValue: 'Email' })}
              </Label>
              <Input
                type="email"
                value={form.customerEmail}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, customerEmail: event.target.value }))
                }
              />
            </div>
            <div>
              <Label className="text-xs uppercase">
                {t('createDrawer.source', { defaultValue: 'Source' })}
              </Label>
              <Select
                value={form.bookingSource}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    bookingSource: (event.target as HTMLInputElement).value as 'staff' | 'walk_in',
                  }))
                }
              >
                <SelectTrigger>
                  <option value="staff">
                    {t('createDrawer.sourceStaff', { defaultValue: 'Phone / staff' })}
                  </option>
                  <option value="walk_in">
                    {t('createDrawer.sourceWalkIn', { defaultValue: 'Walk-in' })}
                  </option>
                </SelectTrigger>
              </Select>
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
            <div>
              <Label className="text-xs uppercase">
                {t('createDrawer.occasion', { defaultValue: 'Occasion' })}
              </Label>
              <Input
                value={form.occasion}
                onChange={(event) => setForm((prev) => ({ ...prev, occasion: event.target.value }))}
                placeholder={t('createDrawer.occasionPlaceholder', {
                  defaultValue: 'Birthday, anniversary…',
                })}
              />
            </div>
            <div>
              <Label className="text-xs uppercase">
                {t('createDrawer.allergies', { defaultValue: 'Allergies' })}
              </Label>
              <Input
                value={form.allergies}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, allergies: event.target.value }))
                }
                placeholder={t('createDrawer.allergiesPlaceholder', {
                  defaultValue: 'Nuts, gluten…',
                })}
              />
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
