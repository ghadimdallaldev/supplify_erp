import { FormEvent, useState } from 'react'
import { Button } from '../../ui/button'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Badge } from '../../ui/badge'
import { Loader2, MapPinned, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useListZonesQuery,
  useCreateZoneMutation,
  useUpdateZoneMutation,
  useDeleteZoneMutation,
  type WarehouseDeliveryZone,
  type WarehouseZoneInput,
} from '../../../services/api/endpoints/warehouses'
import { formatPrice } from '../../../utils/format'

type Props = {
  warehouseId: string
  canWrite?: boolean
}

type ZoneFormState = {
  name: string
  postal_codes: string
  min_order_amount: string
  delivery_fee: string
  radius_km: string
  center_lat: string
  center_lng: string
}

const EMPTY_FORM: ZoneFormState = {
  name: '',
  postal_codes: '',
  min_order_amount: '0',
  delivery_fee: '0',
  radius_km: '',
  center_lat: '',
  center_lng: '',
}

function parsePostalCodes(input: string): string[] | undefined {
  const codes = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return codes.length ? codes : undefined
}

function formatPostalCodes(codes: string[] | null | undefined): string {
  return codes?.join(', ') ?? ''
}

function inferZoneType(form: ZoneFormState): WarehouseZoneInput['zone_type'] {
  const hasRadius = form.radius_km.trim() && form.center_lat.trim() && form.center_lng.trim()
  if (hasRadius) return 'radius'
  if (parsePostalCodes(form.postal_codes)) return 'postal_codes'
  return 'postal_codes'
}

function buildZoneBody(form: ZoneFormState): WarehouseZoneInput {
  const postal_codes = parsePostalCodes(form.postal_codes)
  const radius_km = form.radius_km.trim() ? Number(form.radius_km) : undefined
  const center_lat = form.center_lat.trim() ? Number(form.center_lat) : undefined
  const center_lng = form.center_lng.trim() ? Number(form.center_lng) : undefined

  return {
    name: form.name.trim(),
    zone_type: inferZoneType(form),
    postal_codes,
    min_order_amount: Number(form.min_order_amount || 0),
    delivery_fee: Number(form.delivery_fee || 0),
    radius_km,
    center_lat,
    center_lng,
  }
}

function zoneToForm(zone: WarehouseDeliveryZone): ZoneFormState {
  return {
    name: zone.name,
    postal_codes: formatPostalCodes(zone.postal_codes),
    min_order_amount: String(zone.min_order_amount ?? 0),
    delivery_fee: String(zone.delivery_fee ?? 0),
    radius_km: zone.radius_km != null ? String(zone.radius_km) : '',
    center_lat: zone.center_lat != null ? String(zone.center_lat) : '',
    center_lng: zone.center_lng != null ? String(zone.center_lng) : '',
  }
}

function zoneSummary(zone: WarehouseDeliveryZone): string {
  if (zone.zone_type === 'radius' && zone.radius_km != null) {
    return `Radius ${zone.radius_km} km`
  }
  if (zone.postal_codes?.length) {
    return zone.postal_codes.join(', ')
  }
  return zone.zone_type.replace('_', ' ')
}

export function WarehouseZonesPanel({ warehouseId, canWrite = false }: Props) {
  const { data, isLoading, isError } = useListZonesQuery(warehouseId)
  const [createZone, { isLoading: isCreating }] = useCreateZoneMutation()
  const [updateZone, { isLoading: isUpdating }] = useUpdateZoneMutation()
  const [deleteZone, { isLoading: isDeleting }] = useDeleteZoneMutation()

  const [form, setForm] = useState<ZoneFormState>(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)

  const zones = data?.zones ?? []
  const isSaving = isCreating || isUpdating

  const resetForm = () => {
    setForm(EMPTY_FORM)
    setEditingId(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!canWrite) {
      toast.error('You do not have permission to manage delivery zones')
      return
    }
    if (!form.name.trim()) {
      toast.error('Zone name is required')
      return
    }

    const body = buildZoneBody(form)

    try {
      if (editingId) {
        await updateZone({ warehouseId, zoneId: editingId, body }).unwrap()
        toast.success('Zone updated')
      } else {
        await createZone({ warehouseId, body }).unwrap()
        toast.success('Zone created')
      }
      resetForm()
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to save zone')
    }
  }

  const handleEdit = (zone: WarehouseDeliveryZone) => {
    setEditingId(zone.id)
    setForm(zoneToForm(zone))
  }

  const handleDelete = async (zone: WarehouseDeliveryZone) => {
    if (!canWrite) {
      toast.error('You do not have permission to manage delivery zones')
      return
    }
    if (!window.confirm(`Delete zone "${zone.name}"?`)) return

    try {
      await deleteZone({ warehouseId, zoneId: zone.id }).unwrap()
      if (editingId === zone.id) resetForm()
      toast.success('Zone deleted')
    } catch (err: any) {
      toast.error(err?.data?.error?.message || 'Failed to delete zone')
    }
  }

  return (
    <div className="space-y-6">
      {canWrite && (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-medium">
              {editingId ? 'Edit delivery zone' : 'Add delivery zone'}
            </h4>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>
                Cancel edit
              </Button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="zone-name">Name *</Label>
              <Input
                id="zone-name"
                placeholder="Downtown delivery"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="zone-postal-codes">Postal codes</Label>
              <Input
                id="zone-postal-codes"
                placeholder="SW1, SW2, E1"
                value={form.postal_codes}
                onChange={(e) => setForm({ ...form, postal_codes: e.target.value })}
              />
              <p className="text-xs text-[var(--text-muted)]">Comma-separated prefixes or codes</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="zone-min-order">Min order amount</Label>
              <Input
                id="zone-min-order"
                type="number"
                min="0"
                step="0.01"
                value={form.min_order_amount}
                onChange={(e) => setForm({ ...form, min_order_amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zone-delivery-fee">Delivery fee</Label>
              <Input
                id="zone-delivery-fee"
                type="number"
                min="0"
                step="0.01"
                value={form.delivery_fee}
                onChange={(e) => setForm({ ...form, delivery_fee: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zone-radius">Radius (km)</Label>
              <Input
                id="zone-radius"
                type="number"
                min="0"
                step="0.1"
                placeholder="10"
                value={form.radius_km}
                onChange={(e) => setForm({ ...form, radius_km: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zone-center-lat">Center latitude</Label>
              <Input
                id="zone-center-lat"
                type="number"
                step="any"
                placeholder="51.5074"
                value={form.center_lat}
                onChange={(e) => setForm({ ...form, center_lat: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zone-center-lng">Center longitude</Label>
              <Input
                id="zone-center-lng"
                type="number"
                step="any"
                placeholder="-0.1278"
                value={form.center_lng}
                onChange={(e) => setForm({ ...form, center_lng: e.target.value })}
              />
            </div>
          </div>
          <Button type="submit" disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {editingId ? 'Save changes' : 'Add zone'}
          </Button>
        </form>
      )}

      <div className="space-y-3">
        <h4 className="text-sm font-medium">Delivery zones</h4>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading zones…
          </div>
        )}
        {isError && (
          <p className="text-sm text-red-600" role="alert">
            Could not load delivery zones.
          </p>
        )}
        {!isLoading && !isError && zones.length === 0 && (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-[var(--text-muted)]">
            <MapPinned className="mx-auto mb-2 h-8 w-8 opacity-50" />
            No delivery zones yet. Add a zone to define coverage and fees for this warehouse.
          </div>
        )}
        {zones.map((zone) => (
          <div
            key={zone.id}
            className="flex items-start justify-between gap-3 rounded-lg border p-3"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{zone.name}</span>
                <Badge variant="outline">{zone.zone_type.replace('_', ' ')}</Badge>
                {zone.is_active === false && <Badge variant="secondary">Inactive</Badge>}
              </div>
              <p className="text-sm text-[var(--text-muted)]">{zoneSummary(zone)}</p>
              <p className="text-xs text-[var(--text-muted)]">
                Min order {formatPrice(zone.min_order_amount)} · Fee{' '}
                {formatPrice(zone.delivery_fee)}
              </p>
            </div>
            {canWrite && (
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${zone.name}`}
                  onClick={() => handleEdit(zone)}
                  disabled={isDeleting}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${zone.name}`}
                  onClick={() => handleDelete(zone)}
                  disabled={isDeleting}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
