export function resolveStaffShiftWindow(
  shiftDate: string,
  startTime: string,
  endTime: string
): { startsAt: Date; endsAt: Date } | { error: 'invalid' | 'same' } {
  const startsAt = new Date(`${shiftDate}T${startTime}`)
  const endsAt = new Date(`${shiftDate}T${endTime}`)
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return { error: 'invalid' }
  }
  if (endsAt.getTime() === startsAt.getTime()) return { error: 'same' }
  if (endsAt < startsAt) endsAt.setDate(endsAt.getDate() + 1)
  return { startsAt, endsAt }
}

export function formatShiftClockRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  const startLabel = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const endLabel = end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  if (start.toDateString() === end.toDateString()) return `${startLabel} – ${endLabel}`
  const endDate = end.toLocaleDateString([], { month: 'short', day: 'numeric' })
  return `${startLabel} – ${endDate}, ${endLabel}`
}
