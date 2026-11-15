/** Calendar arithmetic on YYYY-MM-DD keys, independent of the server timezone. */
export function calendarDay(date = new Date(), timeZone = 'UTC') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

export function shiftDay(day, count) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}

export function calendarSeries(rows, asOf, days = 90) {
  const totals = new Map()
  for (const row of rows) {
    const day =
      row.date instanceof Date ? row.date.toISOString().slice(0, 10) : String(row.date).slice(0, 10)
    if (day < shiftDay(asOf, -days) || day >= asOf) continue
    totals.set(day, (totals.get(day) || 0) + Math.max(0, Number(row.quantity) || 0))
  }
  const first = [...totals.keys()].sort()[0]
  if (!first) return []
  const series = []
  for (let day = first; day < asOf; day = shiftDay(day, 1)) {
    series.push({ date: day, quantity: totals.get(day) || 0 })
  }
  return series
}
