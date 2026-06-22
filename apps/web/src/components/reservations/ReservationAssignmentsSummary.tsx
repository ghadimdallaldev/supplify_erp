import { Trans, useTranslation } from 'react-i18next'
import { Reservation, ReservationTable } from '../../types'
import { normalizeTableId, reservationTableIds } from '../../lib/reservation-tables'
import { Badge } from '../ui/badge'
import { Card, CardContent } from '../ui/card'
import { AppPanel } from '../ui/app-panel'

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
  const { t } = useTranslation('reservations')

  const tableNameById = new Map(
    tables.filter((t) => t.id).map((t) => [normalizeTableId(t.id), t.name])
  )

  const rows = reservations
    .filter((r) => r.status !== 'CANCELLED' && r.status !== 'COMPLETED')
    .map((r) => {
      const ids = reservationTableIds(r)
      const tableNames = ids
        .map((id) => tableNameById.get(id) || t('common.unknownTable'))
        .join(', ')
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
          <Trans
            i18nKey="assignments.empty"
            ns="reservations"
            values={{ date: boardDate }}
            components={{ strong: <strong /> }}
          />
        </CardContent>
      </Card>
    )
  }

  return (
    <AppPanel
      title={t('assignments.title')}
      description={t('assignments.description', {
        assigned: assigned.length,
        unassigned: unassigned.length,
        date: boardDate,
      })}
      className="border border-[var(--app-border)]"
    >
      <div className="space-y-2">
        {assigned.map((row) => (
          <div
            key={row.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--mint)]/30 bg-[var(--mint-pale)] px-3 py-2 text-sm"
          >
            <div>
              <span className="font-semibold text-[var(--text)]">{row.name}</span>
              <span className="ms-2 text-xs text-[var(--text-muted)]">{row.when}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{row.tableNames}</Badge>
              <Badge variant="outline">{row.status}</Badge>
            </div>
          </div>
        ))}
        {unassigned.length > 0 ? (
          <p className="text-xs text-[var(--text-muted)]">
            {t('assignments.unassignedList', {
              names: unassigned.map((r) => r.name).join(', '),
            })}
          </p>
        ) : null}
      </div>
    </AppPanel>
  )
}
