import { useEffect, useState } from 'react'
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

export function PublicBookingSettingsCard() {
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
      toast.success('Public booking hours updated')
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Could not save booking hours')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-[var(--brand-mid)]" />
          Public online booking
        </CardTitle>
        <CardDescription>
          Guests use your public reservation link. Capacity comes from active tables in the floor
          plan; hours control which time slots appear.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {isLoading ? (
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading booking settings…
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-[var(--app-border)] bg-[var(--brand-ultra)] p-3 space-y-2">
              <p className="flex items-center gap-2 font-medium text-[var(--text)]">
                <LayoutGrid className="h-4 w-4" />
                Table capacity
              </p>
              <p className="text-[var(--text-muted)]">
                {data?.tableCount
                  ? `${data.tableCount} active table(s), ${data.totalCapacity} total seats — shown as “seats left” per time after guests book.`
                  : 'No active tables yet. Add tables in the floor plan below or guests will see no available times.'}
              </p>
            </div>

            <p className="text-[var(--text-muted)]">{data?.note}</p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="booking-duration">Reservation length (minutes)</Label>
                <Input
                  id="booking-duration"
                  type="number"
                  min={30}
                  max={240}
                  step={15}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value) || 90)}
                />
              </div>
              <div>
                <Label htmlFor="booking-interval">Slot interval (minutes)</Label>
                <Input
                  id="booking-interval"
                  type="number"
                  min={15}
                  max={60}
                  step={15}
                  value={slotIntervalMinutes}
                  onChange={(e) => setSlotIntervalMinutes(Number(e.target.value) || 30)}
                />
              </div>
              <div>
                <Label htmlFor="booking-open">First slot</Label>
                <Input
                  id="booking-open"
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="booking-close">Last seating (close)</Label>
                <Input
                  id="booking-close"
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                />
              </div>
            </div>

            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save public booking hours'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
