import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin, Save, Loader2, ExternalLink, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import {
  useGetRestaurantDeliveryLocationsQuery,
  useUpdateBranchDeliveryLocationMutation,
  useUpdateRestaurantDeliveryLocationMutation,
} from '../../services/api'
import {
  buildDeliveryLocationPayload,
  emptyDeliveryLocationForm,
  formFromDeliveryLocation,
  splitCoordinatePair,
  validateDeliveryLocationForm,
  type DeliveryLocationForm,
} from '../../lib/deliveryLocationForm'
import { ensureNamespace } from '../../i18n'

const VALIDATION_MESSAGE_KEYS: Record<string, string> = {
  'Enter both latitude and longitude, or leave both empty.': 'validation.bothOrEmpty',
  'Latitude and longitude must be valid numbers.': 'validation.invalidNumbers',
  'Latitude or longitude is out of range.': 'validation.outOfRange',
  'Invalid coordinates.': 'validation.invalidCoordinates',
}

function DeliveryLocationFields({
  form,
  onChange,
  idPrefix,
  coordinatesAvailable,
}: {
  form: DeliveryLocationForm
  onChange: (next: DeliveryLocationForm) => void
  idPrefix: string
  coordinatesAvailable?: boolean
}) {
  const handleLatitudeChange = (raw: string) => {
    const pair = splitCoordinatePair(raw)
    if (pair) {
      onChange({ ...form, deliveryLatitude: pair.lat, deliveryLongitude: pair.lng })
      return
    }
    onChange({ ...form, deliveryLatitude: raw })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-[var(--text-muted)]">
          This location is used for delivery ETA and driver navigation.
        </p>
        {coordinatesAvailable ? (
          <Badge variant="secondary" className="text-xs">
            <CheckCircle2 className="mr-1 h-3 w-3" aria-hidden />
            GPS saved
          </Badge>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-lat`}>Latitude</Label>
          <Input
            id={`${idPrefix}-lat`}
            inputMode="decimal"
            placeholder="e.g. 33.8938"
            value={form.deliveryLatitude}
            onChange={(e) => handleLatitudeChange(e.target.value)}
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
        Paste coordinates from Google Maps (you can paste both into latitude)
      </a>
    </div>
  )
}

export function RestaurantDeliveryLocationCard() {
  const { t } = useTranslation('restaurants')
  const { data, isLoading, isError, refetch } = useGetRestaurantDeliveryLocationsQuery()
  const [updateRestaurant, { isLoading: savingRestaurant }] =
    useUpdateRestaurantDeliveryLocationMutation()
  const [updateBranch, { isLoading: savingBranch }] = useUpdateBranchDeliveryLocationMutation()

  const [restaurantForm, setRestaurantForm] = useState<DeliveryLocationForm>(
    emptyDeliveryLocationForm()
  )
  const [branchForms, setBranchForms] = useState<Record<string, DeliveryLocationForm>>({})

  useEffect(() => {
    void ensureNamespace('restaurants')
  }, [])

  useEffect(() => {
    if (!data) return
    setRestaurantForm(formFromDeliveryLocation(data.restaurant))
    const next: Record<string, DeliveryLocationForm> = {}
    for (const branch of data.branches ?? []) {
      next[branch.id] = formFromDeliveryLocation(branch)
    }
    setBranchForms(next)
  }, [data])

  const translateValidationError = (validationError: string | null) => {
    if (!validationError) return null
    const key = VALIDATION_MESSAGE_KEYS[validationError]
    return key ? t(`deliveryLocation.${key}`) : validationError
  }

  const handleSaveRestaurant = async () => {
    const validationError = validateDeliveryLocationForm(restaurantForm)
    if (validationError) {
      toast.error(translateValidationError(validationError))
      return
    }
    try {
      const result = await updateRestaurant(buildDeliveryLocationPayload(restaurantForm)).unwrap()
      if (result.location) {
        setRestaurantForm(
          formFromDeliveryLocation(
            result.location as Parameters<typeof formFromDeliveryLocation>[0]
          )
        )
      }
      toast.success(t('deliveryLocation.toast.saved'))
      refetch()
    } catch (error: unknown) {
      const msg =
        (error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        t('deliveryLocation.toast.saveFailed')
      toast.error(msg)
    }
  }

  const handleSaveBranch = async (branchId: string) => {
    const form = branchForms[branchId]
    if (!form) return
    const validationError = validateDeliveryLocationForm(form)
    if (validationError) {
      toast.error(translateValidationError(validationError))
      return
    }
    try {
      const result = await updateBranch({
        branchId,
        ...buildDeliveryLocationPayload(form),
      }).unwrap()
      if (result.location) {
        setBranchForms((prev) => ({
          ...prev,
          [branchId]: formFromDeliveryLocation(
            result.location as Parameters<typeof formFromDeliveryLocation>[0]
          ),
        }))
      }
      toast.success(t('deliveryLocation.toast.branchSaved'))
      refetch()
    } catch (error: unknown) {
      const msg =
        (error as { data?: { error?: { message?: string } } })?.data?.error?.message ||
        t('deliveryLocation.toast.branchSaveFailed')
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

  if (isError) {
    return (
      <Card data-testid="restaurant-delivery-location-error">
        <CardContent className="pt-6 space-y-3">
          <p className="text-sm text-amber-800 dark:text-amber-200">
            Could not load delivery locations. If this persists, the API may need migration 0143
            (delivery coordinates) applied.
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
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
          Set GPS coordinates where drivers should deliver orders. This is separate from your text
          address above — ETA and tracking need numeric latitude and longitude.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <DeliveryLocationFields
          idPrefix="restaurant-delivery"
          form={restaurantForm}
          onChange={setRestaurantForm}
          coordinatesAvailable={data?.restaurant?.coordinatesAvailable}
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

        {branches.length > 0 ? (
          <div className="space-y-4 border-t border-[var(--app-border)] pt-6">
            <h3 className="text-sm font-semibold">Operational branches</h3>
            <p className="text-sm text-[var(--text-muted)]">
              Orders tied to a branch use that branch&apos;s coordinates when set; otherwise the
              default location above is used.
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
                  form={branchForms[branch.id] ?? emptyDeliveryLocationForm()}
                  onChange={(next) => setBranchForms((prev) => ({ ...prev, [branch.id]: next }))}
                  coordinatesAvailable={branch.coordinatesAvailable}
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
