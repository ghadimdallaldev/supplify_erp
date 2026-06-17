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
import { Textarea } from '../ui/textarea'
import { Select, SelectTrigger } from '../ui/select'
import { Badge } from '../ui/badge'
import { Search, Package, Plus, Clock, Calendar, Repeat } from 'lucide-react'
import { formatPrice } from '../../utils/format'
import { formatDaysOfWeekLabel, parseDaysOfWeek } from '../../utils/parseDaysOfWeek'
import { cn } from '../../lib/utils'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function QuickListScheduleDialog(props: any) {
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
    handleCreateScheduledOrder,
    daysOfWeek,
    toggleScheduleDay,
  } = props

  return (
    <Dialog open={showScheduledOrder} onOpenChange={setShowScheduledOrder}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Schedule Recurring Order</DialogTitle>
          <DialogDescription>
            Set up automatic ordering from "{selectedListForSchedule?.name}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Frequency</Label>
            <Select
              value={scheduleFrequency}
              onValueChange={(value) => {
                const newFrequency = value as any
                setScheduleFrequency(newFrequency)

                // Adjust days based on new frequency
                if (newFrequency === 'WEEKLY') {
                  // Once per week: keep only first day or default to MONDAY
                  setScheduleDays(scheduleDays.length > 0 ? [scheduleDays[0]] : ['MONDAY'])
                } else if (newFrequency === 'WEEKLY_3X') {
                  // Three times per week: limit to first 3 days or default to Mon, Wed, Fri
                  if (scheduleDays.length > 3) {
                    setScheduleDays(scheduleDays.slice(0, 3))
                  } else if (scheduleDays.length === 0) {
                    setScheduleDays(['MONDAY', 'WEDNESDAY', 'FRIDAY'])
                  }
                }
              }}
            >
              <SelectTrigger className="mt-2">
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Once per week</option>
                <option value="WEEKLY_3X">Three times per week</option>
                <option value="BIWEEKLY">Biweekly (Every 2 weeks)</option>
                <option value="MONTHLY">Monthly</option>
              </SelectTrigger>
            </Select>
          </div>

          {(scheduleFrequency === 'WEEKLY' ||
            scheduleFrequency === 'WEEKLY_3X' ||
            scheduleFrequency === 'BIWEEKLY') && (
            <div>
              <Label>
                {scheduleFrequency === 'WEEKLY'
                  ? 'Select One Day'
                  : scheduleFrequency === 'WEEKLY_3X'
                    ? `Select up to 3 Days (${scheduleDays.length} selected)`
                    : `Days of Week (${scheduleDays.length} selected)`}
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
                      <span className="text-sm">{day.charAt(0) + day.slice(1).toLowerCase()}</span>
                    </label>
                  )
                })}
              </div>
              {scheduleDays.length === 0 && (
                <p className="text-sm text-[var(--red)] mt-1">Please select at least one day</p>
              )}
              {scheduleFrequency === 'WEEKLY' && scheduleDays.length > 0 && (
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Selecting a different day will replace the current selection
                </p>
              )}
              {scheduleFrequency === 'WEEKLY_3X' && scheduleDays.length >= 3 && (
                <p className="text-sm text-[var(--text-muted)] mt-1">
                  Maximum of 3 days selected. Deselect a day to select a different one.
                </p>
              )}
            </div>
          )}

          <div>
            <Label>Preferred Time</Label>
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
              Automatically create orders
            </Label>
          </div>

          <div className="bg-[var(--brand-ultra)] border border-[var(--app-border)] rounded-md p-4">
            <p className="text-sm text-[var(--brand-mid)]">
              <strong>Note:</strong> Orders will be{' '}
              {autoCreateOrder ? 'automatically created' : 'reminders sent'} for "
              {selectedListForSchedule?.name}"{scheduleFrequency === 'DAILY' && ' every day'}
              {scheduleFrequency === 'WEEKLY' && ` every week on ${scheduleDays.join(', ')}`}
              {scheduleFrequency === 'WEEKLY_3X' &&
                ` 3 times per week on ${scheduleDays.join(', ')}`}
              {scheduleFrequency === 'BIWEEKLY' && ` every 2 weeks on ${scheduleDays.join(', ')}`}
              {scheduleFrequency === 'MONTHLY' && ' on the same date each month'} at {scheduleTime}.
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
            Cancel
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
            Schedule Recurring Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
