import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import listPlugin from '@fullcalendar/list'
import { AnimatePresence, motion } from 'framer-motion'
import { format } from 'date-fns'
import { CalendarDays, Filter, RefreshCcw, X, Loader2, ArrowLeft, ArrowRight } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Select, SelectTrigger, SelectItem } from './ui/select'
import { useOrdersCalendar } from '../hooks/useOrdersCalendar'
import type { OrdersCalendarEvent } from '../types'

type CalendarViewType = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay' | 'listWeek'

interface CalendarViewProps {
  role?: 'ADMIN' | 'RESTAURANT' | 'SUPPLIER' | null
  isAdmin?: boolean
}

const statusThemeMap: Record<string, string> = {
  completed: 'border-[var(--mint)]/60 bg-[var(--mint-pale)] text-[var(--mint)]',
  pending: 'border-[var(--amber-mid)]/60 bg-[var(--amber-pale)] text-[var(--amber)]',
  in_transit: 'border-[var(--brand-mid)]/60 bg-[var(--brand-ultra)] text-[var(--brand-mid)]',
  cancelled: 'border-[var(--red)]/60 bg-[var(--red-pale)] text-[var(--red)]',
}

const statusDotMap: Record<string, string> = {
  completed: 'bg-[var(--mint)] shadow-[var(--mint)]/40',
  pending: 'bg-[var(--amber-mid)] shadow-[var(--amber-mid)]/40',
  in_transit: 'bg-[var(--brand-mid)] shadow-[var(--brand-mid)]/40',
  cancelled: 'bg-[var(--red)] shadow-[var(--red)]/40',
}

const viewOptions: Array<{ label: string; value: CalendarViewType }> = [
  { label: 'Month', value: 'dayGridMonth' },
  { label: 'Week', value: 'timeGridWeek' },
  { label: 'Day', value: 'timeGridDay' },
  { label: 'Agenda', value: 'listWeek' },
]

const DEFAULT_PAGE_SIZE = 60

export function CalendarView({ role = 'RESTAURANT', isAdmin = false }: CalendarViewProps) {
  const initialRole: 'RESTAURANT' | 'SUPPLIER' = role === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT'
  const [activeRole, setActiveRole] = useState<'RESTAURANT' | 'SUPPLIER'>(initialRole)
  const [currentView, setCurrentView] = useState<CalendarViewType>('dayGridMonth')
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(null)
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [supplierFilter, setSupplierFilter] = useState('')
  const [branchFilter, setBranchFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<OrdersCalendarEvent | null>(null)

  const calendarRef = useRef<FullCalendar | null>(null)

  useEffect(() => {
    setPage(1)
    setStatusFilter('')
    setSupplierFilter('')
    setBranchFilter('')
    setCategoryFilter('')
    setSelectedEvent(null)
  }, [activeRole])

  const { data, isLoading, isFetching, error, refetch } = useOrdersCalendar({
    start: dateRange?.start,
    end: dateRange?.end,
    status: statusFilter || undefined,
    supplier: supplierFilter || undefined,
    branch: branchFilter || undefined,
    category: categoryFilter || undefined,
    page,
    pageSize: DEFAULT_PAGE_SIZE,
    role: activeRole,
    view: currentView,
  })

  const calendarEvents = useMemo(() => {
    if (!data?.events) return []
    return data.events
      .filter((event) => Boolean(event.start))
      .map((event) => ({
        id: event.id,
        title: event.counterpartName ?? 'Order',
        start: event.start,
        end: event.end ?? undefined,
        extendedProps: event,
      }))
  }, [data?.events])

  const supplierLabel = activeRole === 'SUPPLIER' ? 'Restaurant' : 'Supplier'
  const totalPages = useMemo(() => {
    if (!data?.pagination?.total) return 1
    return Math.max(1, Math.ceil(data.pagination.total / DEFAULT_PAGE_SIZE))
  }, [data?.pagination?.total])

  const filtersDisabled = !data?.filters

  const handleViewChange = useCallback(
    (nextView: CalendarViewType) => {
      setCurrentView(nextView)
      const api = calendarRef.current?.getApi()
      if (api && api.view.type !== nextView) {
        api.changeView(nextView)
      }
    },
    [setCurrentView],
  )

  const handleDatesSet = useCallback((arg: { start: Date; end: Date }) => {
    setDateRange({
      start: arg.start.toISOString(),
      end: arg.end.toISOString(),
    })
  }, [])

  const handleEventClick = useCallback((info: { event: { startStr?: string; endStr?: string; extendedProps: unknown }; jsEvent?: { preventDefault: () => void } }) => {
    info.jsEvent?.preventDefault()
    const eventProps = info.event.extendedProps as OrdersCalendarEvent
    setSelectedEvent({
      ...eventProps,
      start: info.event.startStr || eventProps.start,
      end: info.event.endStr || eventProps.end,
    })
  }, [])

  const renderEventContent = useCallback((content: { event: { id?: string; extendedProps: unknown }; view: { type: string } }) => {
    const event = content.event.extendedProps as OrdersCalendarEvent
    const statusKey = event.statusCategory || 'pending'
    const isTimeGridView = content.view.type.includes('timeGrid')
    const amount = event.totalAmount
    const formattedAmount =
      typeof amount === 'number'
        ? new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: event.currency || 'USD',
            maximumFractionDigits: 2,
          }).format(amount)
        : '—'

    if (isTimeGridView) {
      const dotTheme = statusDotMap[statusKey] || statusDotMap.pending
      return (
        <div className="group relative flex h-full items-center justify-center">
          <div className={`h-3.5 w-3.5 rounded-full shadow-sm transition-transform duration-150 group-hover:scale-150 ${dotTheme}`} />
          <div className="pointer-events-none absolute left-1/2 top-full z-30 hidden w-60 -translate-x-1/2 translate-y-2 rounded-xl border border-[var(--app-border)] bg-[var(--surface)] p-3 text-xs text-[var(--text-mid)] shadow-xl group-hover:block">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">{event.type?.replace(/_/g, ' ') || 'Order'}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--text)]">{`#${event.orderId?.slice(0, 8) ?? content.event.id}`}</p>
            {event.status && <p className="mt-1 capitalize text-[var(--text-muted)]">Status: {event.status.replace(/_/g, ' ').toLowerCase()}</p>}
            <p className="mt-1 text-[var(--text-muted)]">Counterpart: {event.counterpartName}</p>
            <p className="mt-1 font-semibold text-[var(--text)]">{formattedAmount}</p>
            {event.branchName && <p className="mt-1 text-[var(--text-muted)]">Branch: {event.branchName}</p>}
            {event.categories?.length ? <p className="mt-1 text-[var(--text-muted)]">Categories: {event.categories.join(', ')}</p> : null}
          </div>
        </div>
      )
    }

    const statusTheme = statusThemeMap[statusKey] || statusThemeMap.pending

    return (
      <div className={`supplify-calendar-event group relative border-l-4 p-2 rounded-lg shadow-sm transition-all hover:shadow-md ${statusTheme}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide">{event.type?.replace(/_/g, ' ') || 'Order'}</span>
          {event.status && (
            <span className="text-[10px] rounded-full bg-white/70 px-2 py-0.5 font-medium text-[var(--text-mid)] shadow-sm">
              {event.status.replace(/_/g, ' ')}
            </span>
          )}
        </div>
        <div className="mt-1 text-sm font-semibold leading-tight text-[var(--text)] truncate">
          {`#${event.orderId?.slice(0, 8) ?? content.event.id}`}
        </div>
        <div className="text-xs text-[var(--text-mid)] truncate">{event.counterpartName}</div>
        <div className="mt-2 text-xs font-semibold text-[var(--text)]">{formattedAmount}</div>
        <div className="pointer-events-none absolute -left-2 top-full z-10 w-48 origin-top-left rounded-lg border border-[var(--app-border)] bg-[var(--surface)] p-3 text-xs text-[var(--text-mid)] opacity-0 shadow-lg transition-all duration-150 group-hover:translate-y-1 group-hover:opacity-100">
          <p className="font-semibold text-[var(--text)]">{event.type?.replace(/_/g, ' ')}</p>
          <p className="mt-1">Status: {event.status}</p>
          {event.branchName && <p>Branch: {event.branchName}</p>}
          {event.categories?.length ? <p>Categories: {event.categories.join(', ')}</p> : null}
        </div>
      </div>
    )
  }, [])

  const clearFilters = useCallback(() => {
    setStatusFilter('')
    setSupplierFilter('')
    setBranchFilter('')
    setCategoryFilter('')
    setPage(1)
  }, [])

  const handleRoleSwitch = useCallback(
    (nextRole: 'RESTAURANT' | 'SUPPLIER') => {
      setActiveRole(nextRole)
      const api = calendarRef.current?.getApi()
      if (api) {
        api.today()
      }
    },
    [setActiveRole],
  )

  return (
    <div className="rounded-3xl border border-[var(--app-border)] bg-[var(--surface)] p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-3 text-[var(--text)]">
            <span className="text-3xl leading-none">📅</span>
            <div>
              <h2 className="text-xl font-semibold">Order Calendar</h2>
              <p className="text-sm text-[var(--text-muted)]">
                Visualize orders, deliveries, and payments {activeRole === 'RESTAURANT' ? 'for your branches' : 'across your restaurant partners'}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {isAdmin && (
            <Select value={activeRole} onValueChange={(val) => handleRoleSwitch(val as 'RESTAURANT' | 'SUPPLIER')}>
              <SelectTrigger className="w-40">
                <option value="RESTAURANT">Restaurant view</option>
                <option value="SUPPLIER">Supplier view</option>
              </SelectTrigger>
            </Select>
          )}
          <div className="flex items-center gap-2">
            {viewOptions.map((option) => (
              <Button
                key={option.value}
                variant={currentView === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleViewChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {isAdmin && (
            <Button
              onClick={() => toast('Event creation is coming soon!')}
              className="bg-[var(--brand)] text-white hover:bg-[var(--brand)]/90"
              size="sm"
            >
              + Add Event
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Select
          value={statusFilter}
          onValueChange={(val) => {
            setStatusFilter(val)
            setPage(1)
          }}
        >
          <SelectTrigger placeholder="All statuses">
            <option value="">All statuses</option>
            {data?.filters?.statuses?.map((status) => (
              <SelectItem key={status} value={status}>
                {status.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectTrigger>
        </Select>

        <Select
          value={supplierFilter}
          onValueChange={(val) => {
            setSupplierFilter(val)
            setPage(1)
          }}
        >
          <SelectTrigger placeholder={`All ${supplierLabel.toLowerCase()}s`}>
            <option value="">{`All ${supplierLabel.toLowerCase()}s`}</option>
            {data?.filters?.suppliers?.map((supplier) => (
              <SelectItem key={supplier.id} value={supplier.id}>
                {supplier.name}
              </SelectItem>
            ))}
          </SelectTrigger>
        </Select>

        <Select
          value={branchFilter}
          onValueChange={(val) => {
            setBranchFilter(val)
            setPage(1)
          }}
        >
          <SelectTrigger placeholder="All branches">
            <option value="">All branches</option>
            {data?.filters?.branches?.map((branch) => (
              <SelectItem key={branch.id} value={branch.id}>
                {branch.name}
              </SelectItem>
            ))}
          </SelectTrigger>
        </Select>

        <Select
          value={categoryFilter}
          onValueChange={(val) => {
            setCategoryFilter(val)
            setPage(1)
          }}
        >
          <SelectTrigger placeholder="All categories">
            <option value="">All categories</option>
            {data?.filters?.categories?.map((category) => (
              <SelectItem key={category} value={category}>
                {category}
              </SelectItem>
            ))}
          </SelectTrigger>
        </Select>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[var(--text-muted)]">
        <Badge variant="outline" className="flex items-center gap-1 border-dashed border-[var(--brand)] text-[var(--brand-mid)]">
          <Filter className="h-3.5 w-3.5" />
          Filters update in real time
        </Badge>
        <Button variant="ghost" size="sm" className="text-[var(--text-muted)] hover:text-[var(--text)]" onClick={clearFilters} disabled={filtersDisabled}>
          <RefreshCcw className="mr-1 h-3.5 w-3.5" />
          Reset
        </Button>
        {isFetching && (
          <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Updating…
          </span>
        )}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--app-border)]">
        {isLoading && (
          <div className="flex h-64 items-center justify-center text-[var(--text-muted)]">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Loading calendar…
          </div>
        )}

        {!isLoading && error && (
          <div className="flex h-64 flex-col items-center justify-center gap-4 text-center text-[var(--text-muted)]">
            <p>Unable to load the order calendar right now.</p>
            <Button onClick={() => refetch()} size="sm">
              Try again
            </Button>
          </div>
        )}

        {!isLoading && !error && (
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            headerToolbar={false}
            initialView={currentView}
            events={calendarEvents}
            eventContent={renderEventContent}
            eventClick={handleEventClick}
            datesSet={handleDatesSet}
            height="auto"
            weekends
            navLinks
            nowIndicator
            selectable={false}
            dayMaxEvents={3}
            slotEventOverlap={false}
            expandRows
            slotDuration="02:00:00"
            slotLabelInterval="02:00:00"
            slotLabelFormat={[
              { hour: 'numeric', minute: '2-digit', hour12: true },
            ]}
            scrollTime="07:00:00"
            views={{
              timeGridWeek: {
                slotDuration: '02:00:00',
                slotLabelInterval: '02:00:00',
              },
              timeGridDay: {
                slotDuration: '01:00:00',
                slotLabelInterval: '01:00:00',
              },
            }}
          />
        )}
      </div>

      <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
          <CalendarDays className="h-4 w-4" />
          <span>
            Showing {data?.events?.length ? data.events.length : 0} of{' '}
            {data?.pagination?.total ? data.pagination.total : 0} events
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Prev
          </Button>
          <span className="text-sm text-[var(--text-muted)]">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages}
          >
            Next
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {selectedEvent && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedEvent(null)}
            />
            <motion.aside
              className="fixed inset-y-0 right-0 z-50 w-full max-w-md overflow-y-auto border-l border-[var(--app-border)] bg-[var(--surface)] p-6 shadow-xl"
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 260, damping: 30 }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-[var(--text-muted)]">{selectedEvent.type?.replace(/_/g, ' ')}</p>
                  <h3 className="text-xl font-semibold text-[var(--text)]">
                    Order #{selectedEvent.orderId?.slice(0, 8) ?? selectedEvent.id}
                  </h3>
                  {selectedEvent.status && (
                    <Badge className="mt-2" variant="secondary">
                      {selectedEvent.status.replace(/_/g, ' ')}
                    </Badge>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => setSelectedEvent(null)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="mt-6 space-y-4 text-sm text-[var(--text-muted)]">
                <div className="flex items-center justify-between text-base font-semibold text-[var(--text)]">
                  <span>Total</span>
                  <span>
                    {new Intl.NumberFormat('en-US', {
                      style: 'currency',
                      currency: selectedEvent.currency || 'USD',
                      maximumFractionDigits: 2,
                    }).format(Number(selectedEvent.totalAmount || 0))}
                  </span>
                </div>
                <div className="grid gap-2">
                  <div className="flex justify-between">
                    <span className="font-medium text-[var(--text-muted)]">Counterpart</span>
                    <span className="text-[var(--text)]">{selectedEvent.counterpartName}</span>
                  </div>
                  {selectedEvent.branchName && (
                    <div className="flex justify-between">
                      <span className="font-medium text-[var(--text-muted)]">Branch</span>
                      <span className="text-[var(--text)]">{selectedEvent.branchName}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="font-medium text-[var(--text-muted)]">Scheduled</span>
                    <span className="text-[var(--text)]">
                      {selectedEvent.start ? format(new Date(selectedEvent.start), 'PPp') : '—'}
                    </span>
                  </div>
                  {selectedEvent.end && (
                    <div className="flex justify-between">
                      <span className="font-medium text-[var(--text-muted)]">Ends</span>
                      <span className="text-[var(--text)]">{format(new Date(selectedEvent.end), 'PPp')}</span>
                    </div>
                  )}
                </div>

                {selectedEvent.categories?.length ? (
                  <div>
                    <p className="font-medium text-[var(--text-muted)]">Categories</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedEvent.categories.map((category) => (
                        <Badge key={category} variant="outline">
                          {category}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}

                {selectedEvent.supplierList?.length ? (
                  <div>
                    <p className="font-medium text-[var(--text-muted)]">
                      {activeRole === 'SUPPLIER' ? 'Restaurant contacts' : 'Suppliers on this order'}
                    </p>
                    <ul className="mt-2 space-y-1 text-[var(--text)]">
                      {selectedEvent.supplierList.map((supplier) => (
                        <li key={supplier.id} className="flex items-center justify-between">
                          <span>{supplier.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="rounded-xl bg-[var(--brand-ultra)] p-4 text-xs text-[var(--text-muted)]">
                  <p className="font-semibold text-[var(--text-muted)]">Tip</p>
                  <p>
                    Track delivery progress and payment deadlines in one place. Filters stay in sync across all views for
                    faster follow-ups.
                  </p>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

