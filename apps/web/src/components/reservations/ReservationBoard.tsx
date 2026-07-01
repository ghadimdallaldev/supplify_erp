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
import { useTranslation } from 'react-i18next'
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
import { toast } from 'sonner'
import { GripVertical } from 'lucide-react'

const STATUS_COLUMN_META: Array<{ id: ReservationStatus; tone: string }> = [
  { id: 'PENDING', tone: 'border-[var(--amber-mid)]/35 bg-[var(--amber-pale)]' },
  { id: 'CONFIRMED', tone: 'border-[var(--mint)]/35 bg-[var(--mint-pale)]' },
  { id: 'SEATED', tone: 'border-[var(--app-border)] bg-[var(--brand-ultra)]' },
  { id: 'WAITLIST', tone: 'border-amber-200 bg-amber-50' },
]

interface ReservationBoardProps {
  reservations: Reservation[]
  tables: ReservationTable[]
  waitlist: ReservationWaitlist[]
  boardDate: string
  branchId?: string
  onOpenReservation?: (reservation: Reservation) => void
  readOnly?: boolean
}

function SortableReservationCard({
  reservation,
  tables,
  onStatusChange,
  onAssignTables,
  updating,
  readOnly = false,
}: {
  reservation: Reservation
  tables: ReservationTable[]
  onStatusChange: (id: string, status: ReservationStatus) => Promise<void>
  onAssignTables: (id: string, tableIds: string[]) => Promise<void>
  boardDate: string
  branchId?: string
  updating: boolean
  readOnly?: boolean
}) {
  const { t } = useTranslation('reservations')
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: reservation.id,
    disabled: readOnly,
  })
  const [pickTableId, setPickTableId] = useState(() => reservationTableIds(reservation)[0] ?? '')

  const quickStatus = useMemo(() => {
    const actions: Partial<
      Record<ReservationStatus, Array<{ status: ReservationStatus; labelKey: string }>>
    > = {
      PENDING: [
        { status: 'CONFIRMED', labelKey: 'board.actions.confirm' },
        { status: 'CANCELLED', labelKey: 'board.actions.cancel' },
      ],
      CONFIRMED: [
        { status: 'SEATED', labelKey: 'board.actions.seat' },
        { status: 'CANCELLED', labelKey: 'board.actions.cancel' },
      ],
      SEATED: [{ status: 'COMPLETED', labelKey: 'board.actions.complete' }],
    }
    return actions[reservation.status]?.map((action) => ({
      ...action,
      label: t(action.labelKey),
    }))
  }, [reservation.status, t])

  useEffect(() => {
    const ids = reservationTableIds(reservation)
    if (ids[0]) setPickTableId(ids[0])
  }, [reservation])

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
        {!readOnly ? (
          <button
            type="button"
            className="mt-0.5 shrink-0 touch-none cursor-grab rounded p-1 text-[var(--text-muted)] hover:bg-[var(--brand-ultra)] active:cursor-grabbing"
            aria-label={t('board.dragAriaLabel')}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        ) : null}
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
            <Badge className="shrink-0 text-xs font-normal">
              {t('common.guests', { count: reservation.party_size })}
            </Badge>
          </div>
          <div className="mt-2 space-y-1 text-xs text-[var(--text-muted)]">
            <p className={assignedTables ? 'font-medium text-[var(--brand-mid)]' : ''}>
              {assignedTables || t('board.unassigned')}
            </p>
            {reservation.customer_phone ? <p>{reservation.customer_phone}</p> : null}
            {reservation.customer_email ? (
              <p className="truncate">{reservation.customer_email}</p>
            ) : null}
          </div>

          {!readOnly &&
          activeTables.length > 0 &&
          reservation.status !== 'CANCELLED' &&
          reservation.status !== 'COMPLETED' ? (
            <div
              className="mt-3 space-y-2"
              onPointerDown={stopDragPropagation}
              onMouseDown={stopDragPropagation}
            >
              <Select value={pickTableId} onValueChange={setPickTableId}>
                <SelectTrigger placeholder={t('board.chooseTablePlaceholder')}>
                  {activeTables.map((table) => (
                    <SelectItem key={table.id} value={table.id}>
                      {t('board.tableSeats', { name: table.name, capacity: table.capacity })}
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
                {t('board.assignTable')}
              </Button>
            </div>
          ) : null}

          {!readOnly && quickStatus?.length ? (
            <div
              className="mt-3 flex flex-wrap gap-1"
              onPointerDown={stopDragPropagation}
              onMouseDown={stopDragPropagation}
            >
              {quickStatus.map((action) => (
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
  const { t } = useTranslation('reservations')

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-amber-900">{entry.customer_name}</span>
        <Badge variant="outline" className="border-amber-300 text-amber-700">
          {t('board.pax', { count: entry.party_size })}
        </Badge>
      </div>
      <div className="mt-1 space-y-1 text-amber-800">
        <p>
          {t('board.requested')}{' '}
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
  readOnly = false,
}: ReservationBoardProps) {
  const { t } = useTranslation('reservations')
  const [updateStatus, { isLoading: updatingStatus }] = useUpdateReservationStatusMutation()
  const [assignTables, { isLoading: assigningTables }] = useAssignReservationTablesMutation()
  const updating = updatingStatus || assigningTables

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  )
  const dragSensors = readOnly ? [] : sensors

  const columns = useMemo(() => {
    return STATUS_COLUMN_META.map((column) => ({
      ...column,
      title: t(`board.columns.${column.id}`),
      reservations: reservations.filter((reservation) => reservation.status === column.id),
    }))
  }, [reservations, t])

  const handleDragEnd = async (event: DragEndEvent) => {
    const destination = event.over?.id as ReservationStatus | undefined
    const reservationId = event.active.id as string

    if (!destination || !STATUS_COLUMN_META.find((col) => col.id === destination)) {
      return
    }

    const reservation = reservations.find((r) => r.id === reservationId)
    if (!reservation || reservation.status === destination) return

    try {
      await updateStatus({ id: reservationId, status: destination }).unwrap()
      toast.success(
        t('board.toasts.movedTo', {
          status: t(`board.statusLower.${destination}`),
        })
      )
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('board.toasts.updateFailed'))
    }
  }

  const handleQuickStatus = async (id: string, status: ReservationStatus) => {
    try {
      await updateStatus({ id, status }).unwrap()
      if (status === 'COMPLETED') {
        toast.success(t('board.toasts.completed'))
      } else if (status === 'SEATED') {
        toast.success(t('board.toasts.seated'))
      } else if (status === 'CANCELLED') {
        toast.success(t('board.toasts.cancelled'))
      } else {
        toast.success(t('board.toasts.updated'))
      }
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('board.toasts.updateFailed'))
    }
  }

  const handleAssignTables = async (id: string, tableIds: string[]) => {
    try {
      await assignTables({ id, tableIds, boardDate, ...(branchId ? { branchId } : {}) }).unwrap()
      toast.success(t('board.toasts.tableAssigned'))
    } catch (error: unknown) {
      const err = error as { data?: { error?: { message?: string } } }
      toast.error(err?.data?.error?.message || t('board.toasts.assignFailed'))
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
            <CardTitle className="text-xl">{t('board.title')}</CardTitle>
            <CardDescription>{t('board.description')}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--text-muted)]">
            <Badge variant="secondary" className="bg-[var(--brand-pale)] text-[var(--brand-mid)]">
              {t('board.totalSeats', { count: totalCapacity })}
            </Badge>
            <Badge variant="secondary" className="bg-[var(--mint-pale)] text-[var(--mint)]">
              {t('board.coversBooked', { count: coversBooked })}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <DndContext sensors={dragSensors} onDragEnd={readOnly ? () => undefined : handleDragEnd}>
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
                          readOnly={readOnly}
                        />
                      ))
                    ) : (
                      <p className="text-xs italic text-[var(--text-muted)]">
                        {t('board.dropHere')}
                      </p>
                    )}
                  </SortableContext>
                </ColumnDropZone>
                {column.id === 'WAITLIST' && waitlist.length > 0 ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-xs font-semibold uppercase text-amber-600">
                      {t('board.liveWaitlist')}
                    </p>
                    {waitlist.map((entry) => (
                      <WaitlistCard key={entry.id} entry={entry} />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </DndContext>
        {updating ? (
          <p className="mt-4 text-sm text-[var(--text-muted)]">{t('common.saving')}</p>
        ) : null}
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
