import { useEffect, useState } from 'react'
import { MapPin, Save, Loader2, ExternalLink } from 'lucide-react'
import toast from 'react-hot-toast'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import {
  useGetRestaurantDeliveryLocationsQuery,
  useUpdateBranchDeliveryLocationMutation,
  useUpdateRestaurantDeliveryLocationMutation,
} from '../../services/api'

type LocationForm = {
  deliveryLatitude: string
  deliveryLongitude: string
  deliveryLocationLabel: string
  deliveryAddressNotes: string
}

const emptyForm = (): LocationForm => ({
  deliveryLatitude: '',
  deliveryLongitude: '',
  deliveryLocationLabel: '',
  deliveryAddressNotes: '',
})

function formFromLocation(
  location?: {
    deliveryLatitude?: number | null
    deliveryLongitude?: number | null
    deliveryLocationLabel?: string | null
    deliveryAddressNotes?: string | null
  } | null
): LocationForm {
  if (!location) return emptyForm()
  return {
    deliveryLatitude: location.deliveryLatitude != null ? String(location.deliveryLatitude) : '',
    deliveryLongitude: location.deliveryLongitude != null ? String(location.deliveryLongitude) : '',
    deliveryLocationLabel: location.deliveryLocationLabel ?? '',
    deliveryAddressNotes: location.deliveryAddressNotes ?? '',
  }
}

function DeliveryLocationFields({
  form,
  onChange,
  idPrefix,
}: {
  form: LocationForm
  onChange: (next: LocationForm) => void
  idPrefix: string
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-muted)]">
        This location is used for delivery ETA and driver navigation.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-lat`}>Latitude</Label>
          <Input
            id={`${idPrefix}-lat`}
            inputMode="decimal"
            placeholder="e.g. 33.8938"
            value={form.deliveryLatitude}
            onChange={(e) => onChange({ ...form, deliveryLatitude: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-lng`}>Longitude</Label>
          <Input
            id={`${idPrefix}-lng`}
            inputMode="decimal"
            placeholder="e.g. 35.5018"
            value={form.deliveryLongitude}
            onChange={(e) => onChange({ ...form, deliveryLongitude: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-label`}>Location label</Label>
        <Input
          id={`${idPrefix}-label`}
          placeholder="e.g. Main entrance, Gate B"
          value={form.deliveryLocationLabel}
          onChange={(e) => onChange({ ...form, deliveryLocationLabel: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${idPrefix}-notes`}>Address notes</Label>
        <Textarea
          id={`${idPrefix}-notes`}
          rows={2}
          placeholder="Optional notes for drivers"
          value={form.deliveryAddressNotes}
          onChange={(e) => onChange({ ...form, deliveryAddressNotes: e.target.value })}
        />
      </div>
      <a
        href="https://maps.google.com"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-sm text-[var(--brand-mid)] hover:underline"
      >
        <ExternalLink className="h-4 w-4" aria-hidden />
        Paste coordinates from Google Maps
      </a>
    </div>
  )
}

export function RestaurantDeliveryLocationCard() {
  const { data, isLoading, refetch } = useGetRestaurantDeliveryLocationsQuery()
  const [updateRestaurant, { isLoading: savingRestaurant }] =
    useUpdateRestaurantDeliveryLocationMutation()
  const [updateBranch, { isLoading: savingBranch }] = useUpdateBranchDeliveryLocationMutation()

  const [restaurantForm, setRestaurantForm] = useState<LocationForm>(emptyForm)
  const [branchForms, setBranchForms] = useState<Record<string, LocationForm>>({})

  useEffect(() => {
    if (!data) return
    setRestaurantForm(formFromLocation(data.restaurant))
    const next: Record<string, LocationForm> = {}
    for (const branch of data.branches ?? []) {
      next[branch.id] = formFromLocation(branch)
    }
    setBranchForms(next)
  }, [data])

  const parsePayload = (form: LocationForm) => ({
    deliveryLatitude: form.deliveryLatitude.trim() ? Number(form.deliveryLatitude) : null,
    deliveryLongitude: form.deliveryLongitude.trim() ? Number(form.deliveryLongitude) : null,
    deliveryLocationLabel: form.deliveryLocationLabel.trim() || null,
    deliveryAddressNotes: form.deliveryAddressNotes.trim() || null,
  })

  const handleSaveRestaurant = async () => {
    try {
      await updateRestaurant(parsePayload(restaurantForm)).unwrap()
      toast.success('Delivery location saved')
      refetch()
    } catch (error: unknown) {
      const msg =
        (error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to save delivery location'
      toast.error(msg)
    }
  }

  const handleSaveBranch = async (branchId: string) => {
    const form = branchForms[branchId]
    if (!form) return
    try {
      await updateBranch({ branchId, ...parsePayload(form) }).unwrap()
      toast.success('Branch delivery location saved')
      refetch()
    } catch (error: unknown) {
      const msg =
        (error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        'Failed to save branch delivery location'
      toast.error(msg)
    }
  }

  if (isLoading) {
    return (
      <Card data-testid="restaurant-delivery-location-loading">
        <CardContent className="pt-6 text-sm text-[var(--text-muted)]">
          Loading delivery location…
        </CardContent>
      </Card>
    )
  }

  const branches = data?.branches ?? []

  return (
    <Card data-testid="restaurant-delivery-location-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-[var(--brand-mid)]" aria-hidden />
          Delivery location
        </CardTitle>
        <CardDescription>
          Set GPS coordinates where drivers should deliver orders for this location.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DeliveryLocationFields
          idPrefix="restaurant-delivery"
          form={restaurantForm}
          onChange={setRestaurantForm}
        />
        <Button
          onClick={handleSaveRestaurant}
          disabled={savingRestaurant}
          data-testid="save-restaurant-delivery-location"
        >
          {savingRestaurant ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save delivery location
            </>
          )}
        </Button>

        {branches.length > 1 ? (
          <div className="space-y-4 border-t border-[var(--app-border)] pt-6">
            <h3 className="text-sm font-semibold">Operational branches</h3>
            <p className="text-sm text-[var(--text-muted)]">
              Orders tied to a branch use that branch&apos;s coordinates when set.
            </p>
            {branches.map((branch) => (
              <div
                key={branch.id}
                className="space-y-3 rounded-lg border border-[var(--app-border)] p-4"
                data-testid={`branch-delivery-location-${branch.id}`}
              >
                <p className="font-medium">{branch.name}</p>
                <DeliveryLocationFields
                  idPrefix={`branch-${branch.id}`}
                  form={branchForms[branch.id] ?? emptyForm()}
                  onChange={(next) => setBranchForms((prev) => ({ ...prev, [branch.id]: next }))}
                />
                <Button
                  variant="outline"
                  onClick={() => handleSaveBranch(branch.id)}
                  disabled={savingBranch}
                >
                  Save branch location
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
