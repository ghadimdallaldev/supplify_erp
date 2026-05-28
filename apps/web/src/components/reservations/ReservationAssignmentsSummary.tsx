import { Reservation, ReservationTable } from '../../types'
import { normalizeTableId, reservationTableIds } from '../../lib/reservation-tables'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'

interface ReservationAssignmentsSummaryProps {
  reservations: Reservation[]
  tables: ReservationTable[]
  boardDate: string
}

export function ReservationAssignmentsSummary({
  reservations,
  tables,
  boardDate,
}: ReservationAssignmentsSummaryProps) {
  const tableNameById = new Map(
    tables.filter((t) => t.id).map((t) => [normalizeTableId(t.id), t.name])
  )

  const rows = reservations
    .filter((r) => r.status !== 'CANCELLED' && r.status !== 'COMPLETED')
    .map((r) => {
      const ids = reservationTableIds(r)
      const tableNames = ids.map((id) => tableNameById.get(id) || 'Unknown table').join(', ')
      return {
        id: r.id,
        name: r.customer_name,
        status: r.status,
        when: new Date(r.scheduled_at).toLocaleString([], {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        tableNames: tableNames || null,
        tableIds: ids,
      }
    })

  const assigned = rows.filter((r) => r.tableIds.length > 0)
  const unassigned = rows.filter((r) => !r.tableIds.length)

  if (!rows.length) {
    return (
      <Card className="border-dashed border-[var(--app-border)] bg-[var(--brand-ultra)]/50">
        <CardContent className="py-4 text-sm text-[var(--text-muted)]">
          No reservations on <strong>{boardDate}</strong>. Change the date above or share your
          booking link with guests.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border border-[var(--app-border)]">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Today&apos;s table map</CardTitle>
        <CardDescription>
          {assigned.length} assigned · {unassigned.length} unassigned on {boardDate}. Matches what
          should appear on the floor below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {assigned.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--mint)]/30 bg-[var(--mint-pale)] px-3 py-2 text-sm"
          >
            <div>
              <span className="font-semibold text-[var(--text)]">{row.name}</span>
              <span className="ml-2 text-xs text-[var(--text-muted)]">{row.when}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{row.tableNames}</Badge>
              <Badge variant="outline">{row.status}</Badge>
            </div>
          </div>
        ))}
        {unassigned.length > 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            Unassigned: {unassigned.map((r) => r.name).join(', ')}
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}
