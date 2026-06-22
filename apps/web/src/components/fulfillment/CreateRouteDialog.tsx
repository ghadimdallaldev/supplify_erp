import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('fulfillment')
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
      toast.error(t('createRoute.toast.selectDriver'))
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
      toast.success(t('createRoute.toast.created'))
      onClose()
      setDriverId('')
      setRouteLabel('')
      setArea('')
    } catch (e: unknown) {
      const msg = (e as { data?: { error?: { message?: string } } })?.data?.error?.message
      toast.error(msg || t('createRoute.toast.createFailed'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('createRoute.title')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-[var(--text-muted)]">
          {t('createRoute.description', { count: selectedOrders.length })}
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
            <Label htmlFor="route-driver">{t('createRoute.driverLabel')}</Label>
            {driversLoading ? (
              <p
                className="mt-1 text-sm text-[var(--text-muted)]"
                data-testid="create-route-drivers-loading"
              >
                {t('createRoute.loadingDrivers')}
              </p>
            ) : driversError ? (
              <p
                className="mt-1 text-sm text-red-600"
                data-testid="create-route-drivers-error"
                role="alert"
              >
                {t('createRoute.driversLoadFailed')}
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
                    {drivers.length === 0
                      ? t('createRoute.noActiveDrivers')
                      : t('createRoute.selectDriver')}
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
            <Label htmlFor="route-date">{t('createRoute.routeDateLabel')}</Label>
            <Input
              id="route-date"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="route-label">{t('createRoute.routeNameLabel')}</Label>
            <Input
              id="route-label"
              placeholder={t('createRoute.routeNamePlaceholder')}
              value={routeLabel}
              onChange={(e) => setRouteLabel(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="route-area">{t('createRoute.areaLabel')}</Label>
            <Input
              id="route-area"
              placeholder={t('createRoute.areaPlaceholder')}
              value={area}
              onChange={(e) => setArea(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            data-testid="create-route-submit"
            onClick={handleCreate}
            disabled={isLoading || !driverId}
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('createRoute.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
