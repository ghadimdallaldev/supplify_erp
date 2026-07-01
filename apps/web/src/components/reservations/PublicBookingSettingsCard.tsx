import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Clock, LayoutGrid, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useGetPublicBookingSettingsQuery,
  useUpdatePublicBookingSettingsMutation,
} from '../../services/reservationsApi'

export function PublicBookingSettingsCard({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTranslation('reservations')
  const { data, isLoading } = useGetPublicBookingSettingsQuery()
  const [updateSettings, { isLoading: saving }] = useUpdatePublicBookingSettingsMutation()

  const [openTime, setOpenTime] = useState('17:00')
  const [closeTime, setCloseTime] = useState('22:00')
  const [durationMinutes, setDurationMinutes] = useState(90)
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState(30)

  useEffect(() => {
    if (data?.openTime) setOpenTime(data.openTime)
    if (data?.closeTime) setCloseTime(data.closeTime)
    if (data?.durationMinutes) setDurationMinutes(data.durationMinutes)
    if (data?.slotIntervalMinutes) setSlotIntervalMinutes(data.slotIntervalMinutes)
  }, [data?.openTime, data?.closeTime, data?.durationMinutes, data?.slotIntervalMinutes])

  const handleSave = async () => {
    try {
      await updateSettings({ openTime, closeTime, durationMinutes, slotIntervalMinutes }).unwrap()
      toast.success(t('publicBooking.toasts.saved'))
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('publicBooking.toasts.saveFailed'))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-[var(--brand-mid)]" />
          {t('publicBooking.title')}
        </CardTitle>
        <CardDescription>{t('publicBooking.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isLoading ? (
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('publicBooking.loading')}
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)] p-3 space-y-2">
              <p className="flex items-center gap-2 font-medium text-[var(--text)]">
                <LayoutGrid className="h-4 w-4" />
                {t('publicBooking.tableCapacity')}
              </p>
              <p className="text-[var(--text-muted)]">
                {data?.tableCount
                  ? t('publicBooking.capacitySummary', {
                      count: data.tableCount,
                      seats: data.totalCapacity,
                    })
                  : t('publicBooking.noActiveTables')}
              </p>
            </div>

            <p className="text-[var(--text-muted)]">{data?.note}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="booking-duration">{t('publicBooking.durationLabel')}</Label>
                <Input
                  id="booking-duration"
                  type="number"
                  min={30}
                  max={240}
                  step={15}
                  value={durationMinutes}
                  disabled={readOnly}
                  onChange={(e) => setDurationMinutes(Number(e.target.value) || 90)}
                />
              </div>
              <div>
                <Label htmlFor="booking-interval">{t('publicBooking.intervalLabel')}</Label>
                <Input
                  id="booking-interval"
                  type="number"
                  min={15}
                  max={60}
                  step={15}
                  value={slotIntervalMinutes}
                  disabled={readOnly}
                  onChange={(e) => setSlotIntervalMinutes(Number(e.target.value) || 30)}
                />
              </div>
              <div>
                <Label htmlFor="booking-open">{t('publicBooking.openLabel')}</Label>
                <Input
                  id="booking-open"
                  type="time"
                  value={openTime}
                  disabled={readOnly}
                  onChange={(e) => setOpenTime(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="booking-close">{t('publicBooking.closeLabel')}</Label>
                <Input
                  id="booking-close"
                  type="time"
                  value={closeTime}
                  disabled={readOnly}
                  onChange={(e) => setCloseTime(e.target.value)}
                />
              </div>
            </div>

            {!readOnly ? (
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? t('common.saving') : t('publicBooking.save')}
              </Button>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
