import { useMemo, useState } from 'react'
import {
  useGetReservationBoardQuery,
  useGetReservationAnalyticsQuery,
} from '../services/reservationsApi'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { ReservationBoard } from '../components/reservations/ReservationBoard'
import { ReservationTableBuilder } from '../components/reservations/ReservationTableBuilder'
import { ReservationAnalyticsPanel } from '../components/reservations/ReservationAnalyticsPanel'
import { ReservationCreateDrawer } from '../components/reservations/ReservationCreateDrawer'
import { CalendarDays, Loader2 } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Input } from '../components/ui/input'

export function ReservationsPage() {
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [range, setRange] = useState<'day' | 'week' | 'month'>('week')

  const { data: boardData, isLoading: boardLoading, refetch } = useGetReservationBoardQuery({ date: selectedDate })
  const { data: analytics, refetch: refetchAnalytics, isLoading: analyticsLoading } = useGetReservationAnalyticsQuery({ range })

  const tables = boardData?.tables ?? []
  const reservations = boardData?.reservations ?? []
  const waitlist = boardData?.waitlist ?? []

  const summary = useMemo(() => {
    const coversToday = reservations.reduce((sum, reservation) => (reservation.status !== 'CANCELLED' ? sum + reservation.party_size : sum), 0)
    const confirmed = reservations.filter((reservation) => reservation.status === 'CONFIRMED').length
    const waitlisted = reservations.filter((reservation) => reservation.status === 'WAITLIST').length
    const seated = reservations.filter((reservation) => reservation.status === 'SEATED').length

    return {
      coversToday,
      confirmed,
      waitlisted,
      seated,
    }
  }, [reservations])

  const handleRangeChange = (value: 'day' | 'week' | 'month') => {
    setRange(value)
    refetchAnalytics()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reservations cockpit</h1>
          <p className="text-sm text-gray-500">Track bookings, optimise capacity, and wow every guest from one unified view.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <CalendarDays className="mr-2 h-4 w-4 text-primary" />
            <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="border-none p-0 text-sm focus-visible:ring-0" />
          </div>
          <ReservationCreateDrawer
            tables={tables}
            onCreated={() => {
              refetch()
              refetchAnalytics()
            }}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-none bg-blue-50 text-blue-700 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-blue-800">Covers today</CardTitle>
            <CardDescription className="text-2xl font-semibold text-blue-900">{summary.coversToday}</CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-none bg-emerald-50 text-emerald-700 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-emerald-800">Confirmed</CardTitle>
            <CardDescription className="text-2xl font-semibold text-emerald-900">{summary.confirmed}</CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-none bg-amber-50 text-amber-700 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-amber-800">Waitlist</CardTitle>
            <CardDescription className="text-2xl font-semibold text-amber-900">{summary.waitlisted}</CardDescription>
          </CardHeader>
        </Card>
        <Card className="border-none bg-sky-50 text-sky-700 shadow-none">
          <CardHeader>
            <CardTitle className="text-sm uppercase tracking-wide text-sky-800">Currently seated</CardTitle>
            <CardDescription className="text-2xl font-semibold text-sky-900">{summary.seated}</CardDescription>
          </CardHeader>
        </Card>
      </div>

      {boardLoading ? (
        <div className="flex h-64 items-center justify-center rounded-3xl border border-dashed border-gray-200">
          <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
          <p className="text-sm text-gray-500">Loading reservations…</p>
        </div>
      ) : (
        <ReservationBoard reservations={reservations} tables={tables} waitlist={waitlist} />
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr,1.4fr]">
        <ReservationTableBuilder tables={tables} />
        <div className="space-y-6">
          <ReservationAnalyticsPanel analytics={analytics} activeRange={range} onRangeChange={handleRangeChange} />
          <Card>
            <CardHeader>
              <CardTitle>Guest intelligence</CardTitle>
              <CardDescription>Snapshot of recent guests and smart follow-ups (coming soon).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-gray-500">
              <p>We’ll surface repeat guests, loyalty moments, and VIP nudges here.</p>
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-4 text-xs text-gray-400">
                <p>✨ Heads up: SMS and WhatsApp confirmations trigger automatically for confirmed seats (configure from Settings soon).</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

