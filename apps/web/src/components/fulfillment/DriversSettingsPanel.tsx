import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Loader2, Truck, Plus, Link2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog'
import type { DriverRecord } from '../../types'
import {
  useGetDriversQuery,
  useGetWarehousesQuery,
  useGetTenantRoleUsersQuery,
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
  user_id: string
}

const emptyForm = (): DriverForm => ({
  full_name: '',
  phone: '',
  vehicle_type: 'van',
  vehicle_plate: '',
  warehouse_id: '',
  notes: '',
  user_id: '',
})

export function DriversSettingsPanel() {
  const { t } = useTranslation('fulfillment')
  const { data, isLoading, refetch } = useGetDriversQuery()
  const { data: warehousesData } = useGetWarehousesQuery()
  const { data: teamUsersData } = useGetTenantRoleUsersQuery()
  const [createDriver, { isLoading: creating }] = useCreateDriverMutation()
  const [updateDriver, { isLoading: updating }] = useUpdateDriverMutation()
  const [deactivateDriver] = useDeactivateDriverMutation()

  const drivers = (data?.drivers ?? []) as DriverRecord[]
  const warehouses = warehousesData?.warehouses ?? []
  const teamUsers = teamUsersData?.users ?? []

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
      user_id: driver.user_id ?? '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.full_name.trim()) {
      toast.error(t('drivers.toast.nameRequired'))
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
        user_id: form.user_id ? form.user_id : null,
      }
      if (editing) {
        await updateDriver({ id: editing.id, data: body }).unwrap()
        toast.success(t('drivers.toast.updated'))
      } else {
        await createDriver(body).unwrap()
        toast.success(t('drivers.toast.added'))
      }
      setModalOpen(false)
      refetch()
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('drivers.toast.saveFailed'))
    }
  }

  const handleDeactivate = async (driver: DriverRecord) => {
    if (!confirm(t('drivers.deactivateConfirm', { name: driver.full_name }))) return
    try {
      await deactivateDriver(driver.id).unwrap()
      toast.success(t('drivers.toast.deactivated'))
      refetch()
    } catch (err: unknown) {
      const message =
        (err as { data?: { error?: { message?: string } } })?.data?.error?.message ===
        'ACTIVE_DELIVERIES'
          ? t('drivers.toast.reassignFirst')
          : t('drivers.toast.deactivateFailed')
      toast.error(message || t('drivers.toast.deactivateFailed'))
    }
  }

  const linkableUsers = teamUsers.filter((u) => {
    const linkedElsewhere = drivers.some((d) => d.user_id === u.id && d.id !== editing?.id)
    return !linkedElsewhere
  })

  return (
    <Card data-testid="drivers-settings-panel">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            {t('drivers.title')}
          </CardTitle>
          <CardDescription>{t('drivers.description')}</CardDescription>
        </div>
        <Button type="button" size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" />
          {t('drivers.addDriver')}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
          </div>
        ) : drivers.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">{t('drivers.empty')}</p>
        ) : (
          <div className="space-y-3">
            {drivers.map((driver) => (
              <div
                key={driver.id}
                data-testid={`driver-row-${driver.id}`}
                className="flex flex-col gap-2 rounded-lg border border-[var(--app-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold">{driver.full_name}</p>
                  {driver.phone && (
                    <p className="text-sm text-[var(--text-muted)]">{driver.phone}</p>
                  )}
                  <p className="text-xs text-[var(--text-muted)] mt-1">
                    {[driver.vehicle_type, driver.vehicle_plate].filter(Boolean).join(' · ')}
                  </p>
                  {driver.user_id ? (
                    <p
                      className="text-xs text-[var(--mint)] mt-1 flex items-center gap-1"
                      data-testid={`driver-linked-${driver.id}`}
                    >
                      <Link2 className="h-3 w-3" aria-hidden />
                      {t('drivers.linked')}{' '}
                      {driver.linked_user_name || driver.linked_user_email || driver.user_id}
                    </p>
                  ) : (
                    <p
                      className="text-xs text-amber-700 mt-1"
                      data-testid={`driver-unlinked-${driver.id}`}
                    >
                      {t('drivers.noLoginLinked')}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {driver.warehouse_name && (
                    <Badge variant="outline">{driver.warehouse_name}</Badge>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openEdit(driver)}>
                    {t('common:actions.edit')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDeactivate(driver)}>
                    {t('drivers.deactivate')}
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
            <DialogTitle>
              {editing ? t('drivers.editDriver') : t('drivers.addDriverDialog')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="full_name">{t('drivers.fullName')}</Label>
              <Input
                id="full_name"
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="link_user">{t('drivers.linkUser')}</Label>
              <Select
                value={form.user_id}
                onValueChange={(value) => setForm({ ...form, user_id: value })}
              >
                <SelectTrigger id="link_user" data-testid="driver-link-user-select">
                  <option value="">{t('drivers.noLoginOption')}</option>
                  {linkableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name || u.email} ({u.role_name || t('drivers.noRole')})
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
              <p className="text-xs text-[var(--text-muted)] mt-1">{t('drivers.linkHint')}</p>
            </div>
            <div>
              <Label htmlFor="phone">{t('drivers.phone')}</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="vehicle_type">{t('drivers.vehicleType')}</Label>
              <Select
                value={form.vehicle_type}
                onValueChange={(value) => setForm({ ...form, vehicle_type: value })}
              >
                <SelectTrigger id="vehicle_type">
                  {VEHICLE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </SelectTrigger>
              </Select>
            </div>
            <div>
              <Label htmlFor="vehicle_plate">{t('drivers.plate')}</Label>
              <Input
                id="vehicle_plate"
                value={form.vehicle_plate}
                onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })}
              />
            </div>
            {warehouses.length > 0 && (
              <div>
                <Label htmlFor="warehouse_id">{t('drivers.homeWarehouse')}</Label>
                <Select
                  value={form.warehouse_id}
                  onValueChange={(value) => setForm({ ...form, warehouse_id: value })}
                >
                  <SelectTrigger id="warehouse_id">
                    <option value="">{t('drivers.none')}</option>
                    {warehouses.map((w: { id: string; name: string }) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </SelectTrigger>
                </Select>
              </div>
            )}
            <div>
              <Label htmlFor="notes">{t('drivers.notes')}</Label>
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
              {t('common:actions.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={creating || updating}>
              {(creating || updating) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common:actions.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
