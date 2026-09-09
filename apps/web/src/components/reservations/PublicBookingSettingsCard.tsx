import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Label } from '../ui/label'
import { Input } from '../ui/input'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { Clock, LayoutGrid, Loader2, Ban } from 'lucide-react'
import { toast } from 'sonner'
import {
  useGetPublicBookingSettingsQuery,
  useUpdatePublicBookingSettingsMutation,
  useGetReservationBlackoutsQuery,
  useCreateReservationBlackoutMutation,
  useDeleteReservationBlackoutMutation,
} from '../../services/reservationsApi'

export function PublicBookingSettingsCard({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTranslation('reservations')
  const { data, isLoading } = useGetPublicBookingSettingsQuery()
  const [updateSettings, { isLoading: saving }] = useUpdatePublicBookingSettingsMutation()
  const { data: blackoutData } = useGetReservationBlackoutsQuery()
  const [createBlackout, { isLoading: creatingBlackout }] = useCreateReservationBlackoutMutation()
  const [deleteBlackout] = useDeleteReservationBlackoutMutation()

  const [openTime, setOpenTime] = useState('17:00')
  const [closeTime, setCloseTime] = useState('22:00')
  const [durationMinutes, setDurationMinutes] = useState(90)
  const [slotIntervalMinutes, setSlotIntervalMinutes] = useState(30)
  const [minPartySize, setMinPartySize] = useState(1)
  const [maxPartySize, setMaxPartySize] = useState(20)
  const [maxCoversPerSlot, setMaxCoversPerSlot] = useState<number | ''>('')
  const [cancelWindowHours, setCancelWindowHours] = useState(2)
  const [depositMode, setDepositMode] = useState<'none' | 'fixed' | 'percent'>('none')
  const [depositAmount, setDepositAmount] = useState(0)
  const [depositPercent, setDepositPercent] = useState(0)
  const [depositPolicyText, setDepositPolicyText] = useState('')
  const [blackoutDate, setBlackoutDate] = useState('')
  const [blackoutReason, setBlackoutReason] = useState('')

  useEffect(() => {
    if (data?.openTime) setOpenTime(data.openTime)
    if (data?.closeTime) setCloseTime(data.closeTime)
    if (data?.durationMinutes) setDurationMinutes(data.durationMinutes)
    if (data?.slotIntervalMinutes) setSlotIntervalMinutes(data.slotIntervalMinutes)
    if (data?.minPartySize) setMinPartySize(data.minPartySize)
    if (data?.maxPartySize) setMaxPartySize(data.maxPartySize)
    if (data?.maxCoversPerSlot != null) setMaxCoversPerSlot(data.maxCoversPerSlot)
    if (data?.cancelWindowHours != null) setCancelWindowHours(data.cancelWindowHours)
    if (data?.depositMode) setDepositMode(data.depositMode)
    if (data?.depositAmount != null) setDepositAmount(data.depositAmount)
    if (data?.depositPercent != null) setDepositPercent(data.depositPercent)
    if (data?.depositPolicyText != null) setDepositPolicyText(data.depositPolicyText)
  }, [data])

  const handleSave = async () => {
    try {
      await updateSettings({
        openTime,
        closeTime,
        durationMinutes,
        slotIntervalMinutes,
        minPartySize,
        maxPartySize,
        maxCoversPerSlot: maxCoversPerSlot === '' ? undefined : Number(maxCoversPerSlot),
        cancelWindowHours,
        depositMode,
        depositAmount,
        depositPercent,
        depositPolicyText,
      }).unwrap()
      toast.success(t('publicBooking.toasts.saved'))
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('publicBooking.toasts.saveFailed'))
    }
  }

  const handleAddBlackout = async () => {
    if (!blackoutDate) return
    try {
      await createBlackout({
        blackoutDate,
        reason: blackoutReason || undefined,
      }).unwrap()
      setBlackoutDate('')
      setBlackoutReason('')
      toast.success(t('publicBooking.blackoutAdded', { defaultValue: 'Blackout date added' }))
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(
        err?.data?.error?.message ||
          t('publicBooking.blackoutFailed', { defaultValue: 'Could not add blackout' })
      )
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
              <div>
                <Label htmlFor="min-party">
                  {t('publicBooking.minParty', { defaultValue: 'Min party size' })}
                </Label>
                <Input
                  id="min-party"
                  type="number"
                  min={1}
                  max={50}
                  value={minPartySize}
                  disabled={readOnly}
                  onChange={(e) => setMinPartySize(Number(e.target.value) || 1)}
                />
              </div>
              <div>
                <Label htmlFor="max-party">
                  {t('publicBooking.maxParty', { defaultValue: 'Max party size' })}
                </Label>
                <Input
                  id="max-party"
                  type="number"
                  min={1}
                  max={100}
                  value={maxPartySize}
                  disabled={readOnly}
                  onChange={(e) => setMaxPartySize(Number(e.target.value) || 20)}
                />
              </div>
              <div>
                <Label htmlFor="max-covers">
                  {t('publicBooking.maxCovers', { defaultValue: 'Max covers / slot' })}
                </Label>
                <Input
                  id="max-covers"
                  type="number"
                  min={1}
                  max={500}
                  value={maxCoversPerSlot}
                  disabled={readOnly}
                  onChange={(e) =>
                    setMaxCoversPerSlot(e.target.value === '' ? '' : Number(e.target.value))
                  }
                />
              </div>
              <div>
                <Label htmlFor="cancel-window">
                  {t('publicBooking.cancelWindow', { defaultValue: 'Cancel window (hours)' })}
                </Label>
                <Input
                  id="cancel-window"
                  type="number"
                  min={0}
                  max={168}
                  value={cancelWindowHours}
                  disabled={readOnly}
                  onChange={(e) => setCancelWindowHours(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--app-border)] p-3">
              <Label htmlFor="deposit-mode">
                {t('publicBooking.depositMode', { defaultValue: 'Deposit policy' })}
              </Label>
              <select
                id="deposit-mode"
                className="flex h-10 w-full rounded-md border border-[var(--app-border)] bg-transparent px-3 text-sm"
                value={depositMode}
                disabled={readOnly}
                onChange={(e) => setDepositMode(e.target.value as 'none' | 'fixed' | 'percent')}
              >
                <option value="none">
                  {t('publicBooking.depositNone', { defaultValue: 'No deposit' })}
                </option>
                <option value="fixed">
                  {t('publicBooking.depositFixed', { defaultValue: 'Fixed amount' })}
                </option>
                <option value="percent">
                  {t('publicBooking.depositPercent', { defaultValue: 'Percent of cover' })}
                </option>
              </select>
              {depositMode === 'fixed' ? (
                <Input
                  type="number"
                  min={0}
                  value={depositAmount}
                  disabled={readOnly}
                  onChange={(e) => setDepositAmount(Number(e.target.value) || 0)}
                  placeholder="Amount"
                />
              ) : null}
              {depositMode === 'percent' ? (
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={depositPercent}
                  disabled={readOnly}
                  onChange={(e) => setDepositPercent(Number(e.target.value) || 0)}
                  placeholder="Percent"
                />
              ) : null}
              <Textarea
                value={depositPolicyText}
                disabled={readOnly}
                onChange={(e) => setDepositPolicyText(e.target.value)}
                placeholder={t('publicBooking.depositPolicyPlaceholder', {
                  defaultValue: 'Shown to guests when booking (refund rules, how to pay)…',
                })}
              />
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--app-border)] p-3">
              <p className="flex items-center gap-2 font-medium">
                <Ban className="h-4 w-4" />
                {t('publicBooking.blackouts', { defaultValue: 'Blackout dates' })}
              </p>
              {!readOnly ? (
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    type="date"
                    value={blackoutDate}
                    onChange={(e) => setBlackoutDate(e.target.value)}
                  />
                  <Input
                    value={blackoutReason}
                    onChange={(e) => setBlackoutReason(e.target.value)}
                    placeholder={t('publicBooking.blackoutReason', {
                      defaultValue: 'Reason (optional)',
                    })}
                  />
                  <Button
                    type="button"
                    onClick={handleAddBlackout}
                    disabled={creatingBlackout || !blackoutDate}
                  >
                    {t('publicBooking.addBlackout', { defaultValue: 'Add' })}
                  </Button>
                </div>
              ) : null}
              <ul className="space-y-1 text-[var(--text-muted)]">
                {(blackoutData?.blackouts ?? []).map((b) => (
                  <li key={b.id} className="flex items-center justify-between gap-2">
                    <span>
                      {b.blackout_date}
                      {b.reason ? ` — ${b.reason}` : ''}
                    </span>
                    {!readOnly ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => void deleteBlackout(b.id)}
                      >
                        {t('publicBooking.remove', { defaultValue: 'Remove' })}
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
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
