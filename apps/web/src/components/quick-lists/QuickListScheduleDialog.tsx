import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Select, SelectTrigger } from '../ui/select'
import { Repeat } from 'lucide-react'

export function QuickListScheduleDialog(props: any) {
  const { t } = useTranslation('cart')
  const {
    showScheduledOrder,
    setShowScheduledOrder,
    selectedListForSchedule,
    setSelectedListForSchedule,
    scheduleFrequency,
    setScheduleFrequency,
    scheduleDays,
    setScheduleDays,
    scheduleTime,
    setScheduleTime,
    autoCreateOrder,
    setAutoCreateOrder,
    useAiQuantities,
    setUseAiQuantities,
    showSmartQuantities,
    handleCreateScheduledOrder,
    daysOfWeek,
    toggleScheduleDay,
  } = props
  const formatDay = (day: string) => t(`quickLists.days.${day}`, { defaultValue: day })
  const selectedDaysLabel = scheduleDays.map(formatDay).join(', ')
  const scheduleNote =
    scheduleFrequency === 'DAILY'
      ? t('quickLists.scheduleDialog.note.daily')
      : scheduleFrequency === 'WEEKLY'
        ? t('quickLists.scheduleDialog.note.weekly', { days: selectedDaysLabel })
        : scheduleFrequency === 'WEEKLY_3X'
          ? t('quickLists.scheduleDialog.note.weekly3x', { days: selectedDaysLabel })
          : scheduleFrequency === 'BIWEEKLY'
            ? t('quickLists.scheduleDialog.note.biweekly', { days: selectedDaysLabel })
            : t('quickLists.scheduleDialog.note.monthly')

  return (
    <Dialog open={showScheduledOrder} onOpenChange={setShowScheduledOrder}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>{t('quickLists.scheduleDialog.title')}</DialogTitle>
          <DialogDescription>
            {t('quickLists.scheduleDialog.description', {
              name: selectedListForSchedule?.name,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>{t('quickLists.scheduleDialog.frequency')}</Label>
            <Select
              value={scheduleFrequency}
              onValueChange={(value) => {
                const newFrequency = value as any
                setScheduleFrequency(newFrequency)

                if (newFrequency === 'WEEKLY') {
                  setScheduleDays(scheduleDays.length > 0 ? [scheduleDays[0]] : ['MONDAY'])
                } else if (newFrequency === 'WEEKLY_3X') {
                  if (scheduleDays.length > 3) {
                    setScheduleDays(scheduleDays.slice(0, 3))
                  } else if (scheduleDays.length === 0) {
                    setScheduleDays(['MONDAY', 'WEDNESDAY', 'FRIDAY'])
                  }
                }
              }}
            >
              <SelectTrigger className="mt-2">
                <option value="DAILY">{t('quickLists.scheduleDialog.frequencyDaily')}</option>
                <option value="WEEKLY">{t('quickLists.scheduleDialog.frequencyWeekly')}</option>
                <option value="WEEKLY_3X">
                  {t('quickLists.scheduleDialog.frequencyWeekly3x')}
                </option>
                <option value="BIWEEKLY">{t('quickLists.scheduleDialog.frequencyBiweekly')}</option>
                <option value="MONTHLY">{t('quickLists.scheduleDialog.frequencyMonthly')}</option>
              </SelectTrigger>
            </Select>
          </div>

          {(scheduleFrequency === 'WEEKLY' ||
            scheduleFrequency === 'WEEKLY_3X' ||
            scheduleFrequency === 'BIWEEKLY') && (
            <div>
              <Label>
                {scheduleFrequency === 'WEEKLY'
                  ? t('quickLists.scheduleDialog.selectOneDay')
                  : scheduleFrequency === 'WEEKLY_3X'
                    ? t('quickLists.scheduleDialog.selectUpToThree', {
                        count: scheduleDays.length,
                      })
                    : t('quickLists.scheduleDialog.daysOfWeek', {
                        count: scheduleDays.length,
                      })}
              </Label>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {daysOfWeek.map((day) => {
                  const isSelected = scheduleDays.includes(day)
                  const isDisabled =
                    (scheduleFrequency === 'WEEKLY_3X' &&
                      !isSelected &&
                      scheduleDays.length >= 3) ||
                    (scheduleFrequency === 'WEEKLY' && !isSelected && scheduleDays.length >= 1)

                  return (
                    <label
                      key={day}
                      className={`flex items-center p-2 border rounded-md transition-colors ${
                        isSelected
                          ? 'bg-[var(--brand)] text-white border-[var(--brand)] cursor-pointer'
                          : isDisabled
                            ? 'bg-[var(--brand-ultra)] text-[var(--text-muted)] border-[var(--app-border)] cursor-not-allowed'
                            : 'bg-white border-[var(--app-border-mid)] hover:bg-[var(--brand-ultra)] cursor-pointer'
                      }`}
                    >
                      <input
                        type={scheduleFrequency === 'WEEKLY' ? 'radio' : 'checkbox'}
                        name={scheduleFrequency === 'WEEKLY' ? 'weeklyDay' : undefined}
                        checked={isSelected}
                        disabled={isDisabled}
                        onChange={() => toggleScheduleDay(day)}
                        className="sr-only"
                      />
                      <span className="text-sm">{formatDay(day)}</span>
                    </label>
                  )
                })}
              </div>
              {scheduleDays.length === 0 && (
                <p className="text-sm text-[var(--red)] mt-1">
                  {t('quickLists.scheduleDialog.selectAtLeastOne')}
                </p>
              )}
              {scheduleFrequency === 'WEEKLY' && scheduleDays.length > 0 && (
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {t('quickLists.scheduleDialog.replaceSelection')}
                </p>
              )}
              {scheduleFrequency === 'WEEKLY_3X' && scheduleDays.length >= 3 && (
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  {t('quickLists.scheduleDialog.maxThreeSelected')}
                </p>
              )}
            </div>
          )}

          <div>
            <Label>{t('quickLists.scheduleDialog.preferredTime')}</Label>
            <Input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="mt-2"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="autoCreate"
              checked={autoCreateOrder}
              onChange={(e) => setAutoCreateOrder(e.target.checked)}
              className="w-4 h-4"
            />
            <Label htmlFor="autoCreate" className="cursor-pointer">
              {t('quickLists.scheduleDialog.autoCreateOrders')}
            </Label>
          </div>

          {showSmartQuantities && (
            <div className="flex items-start space-x-2 rounded-md border border-[var(--app-border)] p-3">
              <input
                type="checkbox"
                id="useAiQuantities"
                checked={useAiQuantities}
                onChange={(e) => setUseAiQuantities(e.target.checked)}
                className="mt-1 w-4 h-4"
              />
              <div>
                <Label htmlFor="useAiQuantities" className="cursor-pointer font-medium">
                  Smart quantities from usage forecast
                </Label>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  When orders are auto-created, adjust line quantities using your inventory forecast
                  (Platinum).
                </p>
              </div>
            </div>
          )}

          <div className="bg-[var(--brand-ultra)] border border-[var(--app-border)] rounded-md p-4">
            <p className="text-sm text-[var(--brand-mid)]">
              <strong>{t('quickLists.scheduleDialog.noteLabel')}</strong>{' '}
              {t('quickLists.scheduleDialog.note.body', {
                action: autoCreateOrder
                  ? t('quickLists.scheduleDialog.note.autoCreated')
                  : t('quickLists.scheduleDialog.note.remindersSent'),
                name: selectedListForSchedule?.name,
                schedule: scheduleNote,
                time: scheduleTime,
              })}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              setShowScheduledOrder(false)
              setSelectedListForSchedule(null)
            }}
          >
            {t('quickLists.scheduleDialog.cancel')}
          </Button>
          <Button
            onClick={handleCreateScheduledOrder}
            disabled={
              (scheduleFrequency === 'WEEKLY' ||
                scheduleFrequency === 'WEEKLY_3X' ||
                scheduleFrequency === 'BIWEEKLY') &&
              scheduleDays.length === 0
            }
          >
            <Repeat className="h-4 w-4 mr-2" />
            {t('quickLists.scheduleDialog.schedule')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
