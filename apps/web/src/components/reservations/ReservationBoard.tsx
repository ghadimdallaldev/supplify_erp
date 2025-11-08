import { DndContext, DragEndEvent, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'
import { useMemo } from 'react'
import { Reservation, ReservationStatus, ReservationTable, ReservationWaitlist } from '../../types'
import { useUpdateReservationStatusMutation } from '../../services/reservationsApi'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'

const STATUS_COLUMNS: Array<{ id: ReservationStatus; title: string; tone: string }> = [
  { id: 'PENDING', title: 'Pending', tone: 'border-yellow-200 bg-yellow-50' },
  { id: 'CONFIRMED', title: 'Confirmed', tone: 'border-emerald-200 bg-emerald-50' },
  { id: 'SEATED', title: 'Seated', tone: 'border-sky-200 bg-sky-50' },
  { id: 'WAITLIST', title: 'Waitlist', tone: 'border-amber-200 bg-amber-50' },
]

interface ReservationBoardProps {
  reservations: Reservation[]
  tables: ReservationTable[]
  waitlist: ReservationWaitlist[]
  onOpenReservation?: (reservation: Reservation) => void
}

function SortableReservationCard({
  reservation,
  tables,
  onOpen,
}: {
  reservation: Reservation
  tables: ReservationTable[]
  onOpen?: (reservation: Reservation) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: reservation.id,
  })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  }

  const assignedTables = reservation.tables
    .map((id) => tables.find((table) => table.id === id)?.name)
    .filter(Boolean)
    .join(', ')

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition hover:shadow-md"
      onClick={() => onOpen?.(reservation)}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900">{reservation.customer_name}</p>
          <p className="text-xs text-gray-500">{new Date(reservation.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        </div>
        <Badge className="text-xs font-normal">{reservation.party_size} guests</Badge>
      </div>
      <div className="mt-2 space-y-1 text-xs text-gray-500">
        <p>{assignedTables || 'Unassigned tables'}</p>
        {reservation.notes ? <p className="line-clamp-2 italic text-gray-400">{reservation.notes}</p> : null}
      </div>
    </div>
  )
}

function WaitlistCard({ entry }: { entry: ReservationWaitlist }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-amber-900">{entry.customer_name}</span>
        <Badge variant="outline" className="border-amber-300 text-amber-700">{entry.party_size} pax</Badge>
      </div>
      <div className="mt-1 space-y-1 text-amber-800">
        <p>Requested: {new Date(entry.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
        {entry.notes ? <p className="line-clamp-2 italic opacity-80">{entry.notes}</p> : null}
      </div>
    </div>
  )
}

export function ReservationBoard({ reservations, tables, waitlist, onOpenReservation }: ReservationBoardProps) {
  const [updateStatus, { isLoading: updating }] = useUpdateReservationStatusMutation()

  const columns = useMemo(() => {
    return STATUS_COLUMNS.map((column) => ({
      ...column,
      reservations: reservations.filter((reservation) => reservation.status === column.id),
    }))
  }, [reservations])

  const handleDragEnd = async (event: DragEndEvent) => {
    const destination = event.over?.id as ReservationStatus | undefined
    const reservationId = event.active.id as string

    if (!destination || !STATUS_COLUMNS.find((col) => col.id === destination)) {
      return
    }

    const reservation = reservations.find((r) => r.id === reservationId)
    if (!reservation || reservation.status === destination) return

    try {
      await updateStatus({ id: reservationId, status: destination }).unwrap()
    } catch (error) {
      logger.error?.('Reservation status update failed', error)
    }
  }

  const totalCapacity = tables.filter((table) => table.is_active).reduce((sum, table) => sum + Number(table.capacity || 0), 0)
  const coversBooked = reservations.reduce((sum, reservation) => (reservation.status !== 'CANCELLED' ? sum + Number(reservation.party_size || 0) : sum), 0)

  const ColumnContainer = ({ columnId, children }: { columnId: ReservationStatus; children: React.ReactNode }) => {
    const { setNodeRef, isOver } = useDroppable({
      id: columnId,
    })

    return (
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-3 rounded-xl border border-dashed border-gray-200 bg-white/40 p-3 transition ${isOver ? 'border-primary bg-primary/5' : ''}`}
      >
        {children}
      </div>
    )
  }

  return (
    <Card className="border-none shadow-none">
      <CardHeader className="px-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl">Reservations Board</CardTitle>
            <CardDescription>Drag reservations across stages to keep the front-of-house perfectly aligned.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500">
            <Badge variant="secondary" className="bg-blue-100 text-blue-700">
              Total seats: {totalCapacity}
            </Badge>
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700">
              Covers booked: {coversBooked}
            </Badge>
            {totalCapacity ? (
              <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
                Utilisation: {Math.round((coversBooked / totalCapacity) * 100)}%
              </Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <DndContext onDragEnd={handleDragEnd}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {columns.map((column) => (
              <div key={column.id} className="flex flex-col rounded-2xl border border-gray-200 bg-gray-50/70 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{column.title}</h3>
                  <Badge variant="secondary" className="bg-white text-gray-600 shadow">
                    {column.reservations.length}
                  </Badge>
                </div>
                <ColumnContainer columnId={column.id}>
                  <SortableContext items={column.reservations.map((reservation) => reservation.id)} strategy={verticalListSortingStrategy}>
                    {column.reservations.length ? (
                      column.reservations.map((reservation) => (
                        <SortableReservationCard key={reservation.id} reservation={reservation} tables={tables} onOpen={onOpenReservation} />
                      ))
                    ) : (
                      <p className="text-xs italic text-gray-400">Drop reservations here</p>
                    )}
                  </SortableContext>
                </ColumnContainer>
                {column.id === 'WAITLIST' && waitlist.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase text-amber-600">Live waitlist</p>
                      <Badge variant="outline" className="border-amber-300 text-amber-700">
                        {waitlist.length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {waitlist.map((entry) => (
                        <WaitlistCard key={entry.id} entry={entry} />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </DndContext>
        {updating && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary"></span>
            Syncing reservation changes…
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// simple logger fallback
const logger = console

