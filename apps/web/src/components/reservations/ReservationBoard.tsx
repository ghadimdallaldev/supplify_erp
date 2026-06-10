import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { normalizeTableId, reservationTableIds } from '../../lib/reservation-tables'
import { Reservation, ReservationStatus, ReservationTable, ReservationWaitlist } from '../../types'
import {
  useAssignReservationTablesMutation,
  useUpdateReservationStatusMutation,
} from '../../services/reservationsApi'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Select, SelectItem, SelectTrigger } from '../ui/select'
import { toast } from 'react-hot-toast'
import { GripVertical } from 'lucide-react'

const STATUS_COLUMNS: Array<{ id: ReservationStatus; title: string; tone: string }> = [
  { id: 'PENDING', title: 'Pending', tone: 'border-[var(--amber-mid)]/35 bg-[var(--amber-pale)]' },
  { id: 'CONFIRMED', title: 'Confirmed', tone: 'border-[var(--mint)]/35 bg-[var(--mint-pale)]' },
  { id: 'SEATED', title: 'Seated', tone: 'border-[var(--app-border)] bg-[var(--brand-ultra)]' },
  { id: 'WAITLIST', title: 'Waitlist', tone: 'border-amber-200 bg-amber-50' },
]

interface ReservationBoardProps {
  reservations: Reservation[]
  tables: ReservationTable[]
  waitlist: ReservationWaitlist[]
  boardDate: string
  branchId?: string
  onOpenReservation?: (reservation: Reservation) => void
}

const QUICK_STATUS: Partial<
  Record<ReservationStatus, Array<{ status: ReservationStatus; label: string }>>
> = {
  PENDING: [
    { status: 'CONFIRMED', label: 'Confirm' },
    { status: 'CANCELLED', label: 'Cancel' },
  ],
  CONFIRMED: [
    { status: 'SEATED', label: 'Seat' },
    { status: 'CANCELLED', label: 'Cancel' },
  ],
  SEATED: [{ status: 'COMPLETED', label: 'Complete' }],
}

function SortableReservationCard({
  reservation,
  tables,
  onStatusChange,
  onAssignTables,
  updating,
}: {
  reservation: Reservation
  tables: ReservationTable[]
  onStatusChange: (id: string, status: ReservationStatus) => Promise<void>
  onAssignTables: (id: string, tableIds: string[]) => Promise<void>
  boardDate: string
  branchId?: string
  updating: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: reservation.id,
  })
  const [pickTableId, setPickTableId] = useState(() => reservationTableIds(reservation)[0] ?? '')

  useEffect(() => {
    const ids = reservationTableIds(reservation)
    if (ids[0]) setPickTableId(ids[0])
  }, [reservation.id, reservation.updated_at, reservation.tables])

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  const assignedIds = reservationTableIds(reservation)
  const assignedTables = assignedIds
    .map((id) => tables.find((table) => table.id && normalizeTableId(table.id) === id)?.name)
    .filter(Boolean)
    .join(', ')

  const activeTables = tables.filter((t) => t.is_active)

  /** Stop dnd-kit from capturing pointer events; do not preventDefault — it blocks native <select>. */
  const stopDragPropagation = (e: React.SyntheticEvent) => {
    e.stopPropagation()
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3 shadow-sm transition hover:shadow-md"
    >
      <div className="flex gap-2">
        <button
          type="button"
          className="mt-0.5 shrink-0 touch-none cursor-grab rounded p-1 text-[var(--text-muted)] hover:bg-[var(--brand-ultra)] active:cursor-grabbing"
          aria-label="Drag reservation"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">
                {reservation.customer_name}
              </p>
              <p className="text-xs text-[var(--text-muted)]">
                {new Date(reservation.scheduled_at).toLocaleString([], {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            </div>
            <Badge className="shrink-0 text-xs font-normal">{reservation.party_size} guests</Badge>
          </div>
          <div className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
            <p className={assignedTables ? 'font-medium text-[var(--brand-mid)]' : ''}>
              {assignedTables || 'Unassigned'}
            </p>
            {reservation.customer_phone ? <p>{reservation.customer_phone}</p> : null}
            {reservation.customer_email ? (
              <p className="truncate">{reservation.customer_email}</p>
            ) : null}
          </div>

          {activeTables.length > 0 &&
          reservation.status !== 'CANCELLED' &&
          reservation.status !== 'COMPLETED' ? (
            <div
              className="mt-3 space-y-2"
              onPointerDown={stopDragPropagation}
              onMouseDown={stopDragPropagation}
            >
              <Select value={pickTableId} onValueChange={setPickTableId}>
                <SelectTrigger placeholder="Choose table…">
                  {activeTables.map((table) => (
                    <SelectItem key={table.id} value={table.id}>
                      {table.name} · {table.capacity} seats
                    </SelectItem>
                  ))}
                </SelectTrigger>
              </Select>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 w-full text-[10px]"
                disabled={updating || !pickTableId}
                onClick={async () => {
                  if (!pickTableId) return
                  await onAssignTables(reservation.id, [pickTableId])
                }}
              >
                Assign table
              </Button>
            </div>
          ) : null}

          {QUICK_STATUS[reservation.status]?.length ? (
            <div
              className="mt-3 flex flex-wrap gap-1"
              onPointerDown={stopDragPropagation}
              onMouseDown={stopDragPropagation}
            >
              {QUICK_STATUS[reservation.status]?.map((action) => (
                <Button
                  key={action.status}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[10px]"
                  disabled={updating}
                  onClick={async () => {
                    await onStatusChange(reservation.id, action.status)
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function WaitlistCard({ entry }: { entry: ReservationWaitlist }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-amber-900">{entry.customer_name}</span>
        <Badge variant="outline" className="border-amber-300 text-amber-700">
          {entry.party_size} pax
        </Badge>
      </div>
      <div className="mt-1 space-y-1 text-amber-800">
        <p>
          Requested:{' '}
          {new Date(entry.requested_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
        {entry.notes ? <p className="line-clamp-2 italic opacity-80">{entry.notes}</p> : null}
      </div>
    </div>
  )
}

export function ReservationBoard({
  reservations,
  tables,
  waitlist,
  boardDate,
  branchId,
}: ReservationBoardProps) {
  const [updateStatus, { isLoading: updatingStatus }] = useUpdateReservationStatusMutation()
  const [assignTables, { isLoading: assigningTables }] = useAssignReservationTablesMutation()
  const updating = updatingStatus || assigningTables

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )

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
      toast.success(`Moved to ${destination.toLowerCase()}`)
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Could not update reservation')
    }
  }

  const handleQuickStatus = async (id: string, status: ReservationStatus) => {
    try {
      await updateStatus({ id, status }).unwrap()
      if (status === 'COMPLETED') {
        toast.success('Reservation completed')
      } else if (status === 'SEATED') {
        toast.success('Guest seated')
      } else if (status === 'CANCELLED') {
        toast.success('Reservation cancelled')
      } else {
        toast.success('Reservation updated')
      }
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Could not update reservation')
    }
  }

  const handleAssignTables = async (id: string, tableIds: string[]) => {
    try {
      await assignTables({ id, tableIds, boardDate, ...(branchId ? { branchId } : {}) }).unwrap()
      toast.success('Table assigned')
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || 'Could not assign table')
    }
  }

  const totalCapacity = tables
    .filter((table) => table.is_active)
    .reduce((sum, table) => sum + Number(table.capacity || 0), 0)
  const coversBooked = reservations.reduce(
    (sum, reservation) =>
      reservation.status !== 'CANCELLED' && reservation.status !== 'COMPLETED'
        ? sum + Number(reservation.party_size || 0)
        : sum,
    0
  )

  return (
    <Card className="border-none shadow-none">
      <CardHeader className="px-0">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle className="text-xl">Reservations Board</CardTitle>
            <CardDescription>
              Assign a table on each card, then use Seat / Complete — or drag by the grip handle.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
            <Badge variant="secondary" className="bg-[var(--brand-pale)] text-[var(--brand-mid)]">
              Total seats: {totalCapacity}
            </Badge>
            <Badge variant="secondary" className="bg-[var(--mint-pale)] text-[var(--mint)]">
              Covers booked: {coversBooked}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {columns.map((column) => (
              <div
                key={column.id}
                className="flex flex-col rounded-2xl border border-[var(--app-border)] bg-[var(--brand-ultra)]/70 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">
                    {column.title}
                  </h3>
                  <Badge
                    variant="secondary"
                    className="bg-[var(--surface)] text-[var(--text-muted)] shadow"
                  >
                    {column.reservations.length}
                  </Badge>
                </div>
                <ColumnDropZone columnId={column.id}>
                  <SortableContext
                    items={column.reservations.map((reservation) => reservation.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {column.reservations.length ? (
                      column.reservations.map((reservation) => (
                        <SortableReservationCard
                          key={reservation.id}
                          reservation={reservation}
                          tables={tables}
                          onStatusChange={handleQuickStatus}
                          onAssignTables={handleAssignTables}
                          boardDate={boardDate}
                          branchId={branchId}
                          updating={updating}
                        />
                      ))
                    ) : (
                      <p className="text-xs italic text-[var(--text-muted)]">
                        Drop reservations here
                      </p>
                    )}
                  </SortableContext>
                </ColumnDropZone>
                {column.id === 'WAITLIST' && waitlist.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase text-amber-600">Live waitlist</p>
                    {waitlist.map((entry) => (
                      <WaitlistCard key={entry.id} entry={entry} />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </DndContext>
        {updating ? <p className="mt-4 text-sm text-[var(--text-muted)]">Saving…</p> : null}
      </CardContent>
    </Card>
  )
}

function ColumnDropZone({
  columnId,
  children,
}: {
  columnId: ReservationStatus
  children: React.ReactNode
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columnId })

  return (
    <div
      ref={setNodeRef}
      className={`flex-1 space-y-3 rounded-xl border border-dashed border-[var(--app-border)] bg-white/40 p-3 transition ${
        isOver ? 'border-[var(--brand)] bg-[var(--brand-pale)]' : ''
      }`}
    >
      {children}
    </div>
  )
}
