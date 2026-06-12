import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Badge } from '../components/ui/badge'
import { Skeleton } from '../components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { toast } from 'sonner'
import { EmptyState } from '../components/ui/empty-state'
import {
  useGetMeQuery,
  useGetStaffPortalDashboardQuery,
  useGetStaffPortalTimeEntriesQuery,
  useGetStaffSelfDashboardQuery,
  useGetStaffSelfTimeEntriesQuery,
  useStaffPortalCheckInMutation,
  useStaffPortalCheckOutMutation,
  useStaffSelfCheckInMutation,
  useStaffSelfCheckOutMutation,
  useSubmitStaffPortalPtoMutation,
  useSubmitStaffPortalSwapMutation,
  useSubmitStaffSelfPtoMutation,
  useSubmitStaffSelfSwapMutation,
  useLogoutMutation,
  useAcknowledgeStaffPortalAnnouncementMutation,
  useAcknowledgeStaffSelfAnnouncementMutation,
  useGetStaffSelfAvailabilityQuery,
  useGetStaffPortalAvailabilityQuery,
  useSetStaffSelfAvailabilityMutation,
  useSetStaffPortalAvailabilityMutation,
} from '../services/api'
import type { StaffPortalDashboard, StaffTimeEntry } from '../types'
import { getApiErrorMessage } from '../lib/apiError'
import { PublicPanel } from '../components/public/PublicPageLayout'
import { StaffPortalShell, type StaffPortalTab } from '../components/staff/portal/StaffPortalShell'
import { AlertCircle, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'

const PTO_TYPES = [
  { value: 'VACATION', label: 'Vacation' },
  { value: 'SICK', label: 'Sick' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'OTHER', label: 'Other' },
]

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function useStaffToken() {
  const [searchParams, setSearchParams] = useSearchParams()
  const urlToken = searchParams.get('token')
  const [storedToken, setStoredToken] = useState(
    () => localStorage.getItem('staff.portal.token') ?? ''
  )

  useEffect(() => {
    if (!urlToken) return
    localStorage.setItem('staff.portal.token', urlToken)
    setStoredToken(urlToken)
    const next = new URLSearchParams(searchParams)
    next.delete('token')
    setSearchParams(next, { replace: true })
  }, [urlToken, searchParams, setSearchParams])

  return urlToken ?? storedToken
}

function formatShiftTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export function StaffSelfServiceDashboard() {
  const navigate = useNavigate()
  const token = useStaffToken()
  const magicLinkMode = Boolean(token)
  const [activeTab, setActiveTab] = useState<StaffPortalTab>('home')

  const { data: me } = useGetMeQuery(undefined, { skip: magicLinkMode })
  const accountMode =
    !magicLinkMode && (me?.role === 'STAFF_PORTAL' || me?.accessType === 'staff_portal')

  const {
    data: magicData,
    isLoading: magicLoading,
    isError: magicError,
    error: magicErrorDetail,
    refetch: refetchMagic,
  } = useGetStaffPortalDashboardQuery({ token }, { skip: !magicLinkMode })
  const {
    data: accountData,
    isLoading: accountLoading,
    isError: accountError,
    error: accountErrorDetail,
    refetch: refetchAccount,
  } = useGetStaffSelfDashboardQuery(undefined, { skip: !accountMode })

  const data = magicLinkMode ? magicData : accountData
  const isLoading = magicLinkMode ? magicLoading : accountLoading
  const loadError = magicLinkMode ? magicError : accountError
  const loadErrorDetail = magicLinkMode ? magicErrorDetail : accountErrorDetail
  const refetch = magicLinkMode ? refetchMagic : refetchAccount

  const { data: magicTimeEntries = [], refetch: refetchMagicTime } =
    useGetStaffPortalTimeEntriesQuery({ token }, { skip: !magicLinkMode })
  const { data: accountTimeEntries = [], refetch: refetchAccountTime } =
    useGetStaffSelfTimeEntriesQuery(undefined, { skip: !accountMode })
  const timeEntries = magicLinkMode ? magicTimeEntries : accountTimeEntries
  const refetchTimeEntries = magicLinkMode ? refetchMagicTime : refetchAccountTime

  const [magicCheckIn, { isLoading: magicCheckingIn }] = useStaffPortalCheckInMutation()
  const [magicCheckOut, { isLoading: magicCheckingOut }] = useStaffPortalCheckOutMutation()
  const [accountCheckIn, { isLoading: accountCheckingIn }] = useStaffSelfCheckInMutation()
  const [accountCheckOut, { isLoading: accountCheckingOut }] = useStaffSelfCheckOutMutation()
  const checkingIn = magicLinkMode ? magicCheckingIn : accountCheckingIn
  const checkingOut = magicLinkMode ? magicCheckingOut : accountCheckingOut

  const [magicSubmitPto, { isLoading: magicSubmittingPto }] = useSubmitStaffPortalPtoMutation()
  const [accountSubmitPto, { isLoading: accountSubmittingPto }] = useSubmitStaffSelfPtoMutation()
  const submittingPto = magicLinkMode ? magicSubmittingPto : accountSubmittingPto

  const [magicSubmitSwap, { isLoading: magicSubmittingSwap }] = useSubmitStaffPortalSwapMutation()
  const [accountSubmitSwap, { isLoading: accountSubmittingSwap }] = useSubmitStaffSelfSwapMutation()
  const submittingSwap = magicLinkMode ? magicSubmittingSwap : accountSubmittingSwap

  const [ptoForm, setPtoForm] = useState({
    type: 'VACATION',
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    hoursRequested: '',
    reason: '',
  })

  const [swapForm, setSwapForm] = useState({
    shiftId: '',
    proposedCoverId: '',
    reason: '',
  })
  const [availabilityForm, setAvailabilityForm] = useState({
    weekday: '1',
    start: '09:00',
    end: '17:00',
    notes: '',
  })

  const [logout] = useLogoutMutation()
  const [ackPortalAnnouncement] = useAcknowledgeStaffPortalAnnouncementMutation()
  const [ackSelfAnnouncement] = useAcknowledgeStaffSelfAnnouncementMutation()
  const { data: selfAvailability = [] } = useGetStaffSelfAvailabilityQuery(undefined, {
    skip: !accountMode,
  })
  const { data: portalAvailability = [] } = useGetStaffPortalAvailabilityQuery(
    { token },
    { skip: !magicLinkMode || !token }
  )
  const availability = magicLinkMode ? portalAvailability : selfAvailability
  const [setSelfAvailability, { isLoading: savingSelfAvailability }] =
    useSetStaffSelfAvailabilityMutation()
  const [setPortalAvailability, { isLoading: savingPortalAvailability }] =
    useSetStaffPortalAvailabilityMutation()
  const savingAvailability = magicLinkMode ? savingPortalAvailability : savingSelfAvailability

  useEffect(() => {
    if (!magicLinkMode && me && !accountMode) {
      navigate('/staff/login', { replace: true })
    }
  }, [magicLinkMode, me, accountMode, navigate])

  useEffect(() => {
    if (data?.upcomingShifts?.length && !swapForm.shiftId) {
      setSwapForm((prev) => ({ ...prev, shiftId: data.upcomingShifts[0].id }))
    }
  }, [data?.upcomingShifts, swapForm.shiftId])

  const openEntry = timeEntries.find((e: StaffTimeEntry) => !e.clockOutAt)
  const unreadAnnouncements = data?.announcements.filter((a) => !a.acknowledged).length ?? 0

  const handleSubmitPto = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!magicLinkMode && !accountMode) return
    if (new Date(ptoForm.endDate) < new Date(ptoForm.startDate)) {
      toast.error('End date cannot be before start date')
      return
    }

    try {
      const body = {
        type: ptoForm.type as (typeof PTO_TYPES)[number]['value'],
        startDate: ptoForm.startDate,
        endDate: ptoForm.endDate,
        hoursRequested: ptoForm.hoursRequested ? Number(ptoForm.hoursRequested) : undefined,
        reason: ptoForm.reason || undefined,
      }
      if (magicLinkMode) {
        await magicSubmitPto({ token, ...body }).unwrap()
      } else {
        await accountSubmitPto(body).unwrap()
      }
      toast.success('Time-off request submitted')
      setPtoForm((prev) => ({ ...prev, reason: '' }))
      refetch()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to submit PTO request'))
    }
  }

  const handleSubmitSwap = async (event: React.FormEvent) => {
    event.preventDefault()
    if ((!magicLinkMode && !accountMode) || !swapForm.shiftId) {
      toast.error('Select a shift to request a swap')
      return
    }

    try {
      const body = {
        shiftId: swapForm.shiftId,
        proposedCoverId: swapForm.proposedCoverId || undefined,
        reason: swapForm.reason || undefined,
      }
      if (magicLinkMode) {
        await magicSubmitSwap({ token, ...body }).unwrap()
      } else {
        await accountSubmitSwap(body).unwrap()
      }
      toast.success('Shift swap request sent')
      setSwapForm((prev) => ({ ...prev, reason: '' }))
      refetch()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to submit shift swap request'))
    }
  }

  const handleEndSession = async () => {
    if (magicLinkMode) {
      localStorage.removeItem('staff.portal.token')
      navigate('/staff/login', { replace: true })
      return
    }
    try {
      await logout().unwrap()
    } catch {
      /* still redirect */
    }
    navigate('/staff/login', { replace: true })
  }

  const handleAckAnnouncement = async (announcementId: string) => {
    try {
      if (magicLinkMode) {
        await ackPortalAnnouncement({ token, announcementId }).unwrap()
      } else {
        await ackSelfAnnouncement(announcementId).unwrap()
      }
      toast.success('Announcement acknowledged')
      refetch()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to acknowledge announcement'))
    }
  }

  const handleSaveAvailability = async (event: React.FormEvent) => {
    event.preventDefault()
    const body = {
      weekday: Number(availabilityForm.weekday),
      availability: {
        blocks: [{ start: availabilityForm.start, end: availabilityForm.end }],
      },
      notes: availabilityForm.notes || undefined,
    }
    try {
      if (magicLinkMode) {
        await setPortalAvailability({ token, ...body }).unwrap()
      } else {
        await setSelfAvailability(body).unwrap()
      }
      toast.success('Availability saved')
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to save availability'))
    }
  }

  const handleClockIn = async () => {
    if (!magicLinkMode && !accountMode) return
    try {
      if (magicLinkMode) {
        await magicCheckIn({ token }).unwrap()
      } else {
        await accountCheckIn({}).unwrap()
      }
      toast.success('Clocked in')
      refetchTimeEntries()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to clock in'))
    }
  }

  const handleClockOut = async () => {
    if ((!magicLinkMode && !accountMode) || !openEntry) return
    try {
      if (magicLinkMode) {
        await magicCheckOut({ token, id: openEntry.id }).unwrap()
      } else {
        await accountCheckOut({ id: openEntry.id }).unwrap()
      }
      toast.success('Clocked out')
      refetchTimeEntries()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, 'Unable to clock out'))
    }
  }

  if (!magicLinkMode && !accountMode && !isLoading) {
    return null
  }

  if (loadError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[var(--brand-ultra)] px-4 py-12">
        <AlertCircle className="h-10 w-10 text-[var(--red)]" />
        <p className="mt-4 max-w-sm text-center text-sm text-[var(--text-muted)]">
          {getApiErrorMessage(loadErrorDetail, 'Unable to load your staff dashboard.')}
        </p>
        <Button variant="outline" className="consumer-pressable mt-4" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-dvh bg-[var(--brand-ultra)] px-4 py-8" role="status" aria-live="polite">
        <div className="mx-auto flex max-w-3xl flex-col gap-4">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  const {
    staff,
    upcomingShifts,
    ptoRequests,
    swapRequests,
    announcements,
    documents,
    teammates = [],
  } = data
  const nextShift = upcomingShifts[0]

  const clockLabel = openEntry
    ? `Clocked in since ${formatShiftTime(openEntry.clockInAt)}`
    : "You're off the clock"

  return (
    <StaffPortalShell
      staffName={staff.display_name}
      role={staff.role}
      clockLabel={clockLabel}
      isClockedIn={Boolean(openEntry)}
      checkingIn={checkingIn}
      checkingOut={checkingOut}
      onClockIn={handleClockIn}
      onClockOut={handleClockOut}
      onSignOut={handleEndSession}
      signOutLabel={magicLinkMode ? 'End session' : 'Sign out'}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabBadges={{ home: unreadAnnouncements }}
    >
      {activeTab === 'home' && (
        <div className="space-y-5">
          {nextShift ? (
            <PublicPanel title="Next shift">
              <p className="text-lg font-semibold text-[var(--text)]">{nextShift.role}</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {new Date(nextShift.shift_date).toLocaleDateString(undefined, {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric',
                })}{' '}
                · {formatShiftTime(nextShift.starts_at)} – {formatShiftTime(nextShift.ends_at)}
              </p>
              <Button
                variant="link"
                className="consumer-pressable mt-2 h-auto p-0 text-[var(--brand-mid)]"
                onClick={() => setActiveTab('schedule')}
              >
                View all shifts
                <ChevronRight className="ml-0.5 h-4 w-4" />
              </Button>
            </PublicPanel>
          ) : (
            <PublicPanel title="Next shift">
              <EmptyState
                title="No shifts scheduled"
                description="Check back when your manager publishes the schedule."
              />
            </PublicPanel>
          )}

          <PublicPanel
            title="Announcements"
            description={
              unreadAnnouncements > 0 ? `${unreadAnnouncements} unread` : "You're all caught up."
            }
          >
            {announcements.length === 0 ? (
              <EmptyState title="No announcements" description="Nothing new from your team." />
            ) : (
              <div className="divide-y divide-[var(--app-border)]">
                {announcements.map(
                  (announcement: StaffPortalDashboard['announcements'][number]) => (
                    <div key={announcement.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-[var(--text)]">{announcement.title}</p>
                        <Badge variant={announcement.acknowledged ? 'secondary' : 'default'}>
                          {announcement.acknowledged ? 'Read' : 'New'}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-muted)]">
                        {announcement.body}
                      </p>
                      {announcement.require_ack && !announcement.acknowledged ? (
                        <Button
                          size="sm"
                          className="consumer-pressable mt-3 w-full sm:w-auto"
                          onClick={() => handleAckAnnouncement(announcement.id)}
                        >
                          Acknowledge
                        </Button>
                      ) : null}
                    </div>
                  )
                )}
              </div>
            )}
          </PublicPanel>
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="space-y-5">
          <PublicPanel title="My shifts" description="Tap a shift to select it for a swap request.">
            {upcomingShifts.length === 0 ? (
              <EmptyState
                title="No shifts scheduled"
                description="Check back when your manager publishes the schedule."
              />
            ) : (
              <div className="divide-y divide-[var(--app-border)]">
                {upcomingShifts.map((shift: StaffPortalDashboard['upcomingShifts'][number]) => (
                  <button
                    key={shift.id}
                    type="button"
                    onClick={() => setSwapForm((prev) => ({ ...prev, shiftId: shift.id }))}
                    className={cn(
                      'consumer-menu-item flex w-full items-center justify-between py-3 text-left first:pt-0 last:pb-0',
                      swapForm.shiftId === shift.id &&
                        'rounded-lg bg-[var(--brand-pale)] px-3 -mx-3'
                    )}
                  >
                    <div>
                      <p className="font-medium text-[var(--text)]">{shift.role}</p>
                      <p className="text-sm text-[var(--text-muted)]">
                        {new Date(shift.shift_date).toLocaleDateString()} ·{' '}
                        {formatShiftTime(shift.starts_at)}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {shift.status.toLowerCase()}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </PublicPanel>

          <PublicPanel title="Request shift swap">
            <form className="space-y-3" onSubmit={handleSubmitSwap}>
              <div>
                <Label>Preferred cover (optional)</Label>
                <Select
                  value={swapForm.proposedCoverId || '__none__'}
                  onValueChange={(value) =>
                    setSwapForm((prev) => ({
                      ...prev,
                      proposedCoverId: value === '__none__' ? '' : value,
                    }))
                  }
                >
                  <SelectTrigger className="mt-1.5 min-h-11 w-full">
                    <SelectValue placeholder="Select teammate" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No preference</SelectItem>
                    {teammates.map((mate) => (
                      <SelectItem key={mate.id} value={mate.id}>
                        {mate.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea
                  className="mt-1.5"
                  value={swapForm.reason}
                  placeholder="Why do you need a swap?"
                  onChange={(event) =>
                    setSwapForm((prev) => ({ ...prev, reason: event.target.value }))
                  }
                />
              </div>
              <Button
                type="submit"
                className="consumer-pressable min-h-11 w-full bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
                disabled={submittingSwap || !swapForm.shiftId}
              >
                {submittingSwap ? 'Submitting…' : 'Send swap request'}
              </Button>
            </form>
          </PublicPanel>
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="space-y-5">
          <PublicPanel title="Request time off">
            <form className="space-y-3" onSubmit={handleSubmitPto}>
              <div>
                <Label>Type</Label>
                <Select
                  value={ptoForm.type}
                  onValueChange={(value) => setPtoForm((prev) => ({ ...prev, type: value }))}
                >
                  <SelectTrigger className="mt-1.5 min-h-11 w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PTO_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Start date</Label>
                  <Input
                    type="date"
                    className="mt-1.5 min-h-11 w-full"
                    value={ptoForm.startDate}
                    onChange={(event) =>
                      setPtoForm((prev) => ({ ...prev, startDate: event.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>End date</Label>
                  <Input
                    type="date"
                    className="mt-1.5 min-h-11 w-full"
                    value={ptoForm.endDate}
                    onChange={(event) =>
                      setPtoForm((prev) => ({ ...prev, endDate: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Hours (optional)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  className="mt-1.5 min-h-11 w-full"
                  value={ptoForm.hoursRequested}
                  onChange={(event) =>
                    setPtoForm((prev) => ({ ...prev, hoursRequested: event.target.value }))
                  }
                />
              </div>
              <div>
                <Label>Reason (optional)</Label>
                <Textarea
                  className="mt-1.5"
                  value={ptoForm.reason}
                  placeholder="Tell your manager why you need time off."
                  onChange={(event) =>
                    setPtoForm((prev) => ({ ...prev, reason: event.target.value }))
                  }
                />
              </div>
              <Button
                type="submit"
                className="consumer-pressable min-h-11 w-full bg-[var(--brand-mid)] hover:bg-[var(--brand)]"
                disabled={submittingPto}
              >
                {submittingPto ? 'Submitting…' : 'Submit request'}
              </Button>
            </form>
          </PublicPanel>

          <PublicPanel
            title="My availability"
            description="Let managers know when you prefer to work."
          >
            <form className="space-y-3" onSubmit={handleSaveAvailability}>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Weekday</Label>
                  <Select
                    value={availabilityForm.weekday}
                    onValueChange={(value) =>
                      setAvailabilityForm((prev) => ({ ...prev, weekday: value }))
                    }
                  >
                    <SelectTrigger className="mt-1.5 min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((day, index) => (
                        <SelectItem key={day} value={String(index)}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Start</Label>
                  <Input
                    type="time"
                    className="mt-1.5 min-h-11"
                    value={availabilityForm.start}
                    onChange={(e) =>
                      setAvailabilityForm((prev) => ({ ...prev, start: e.target.value }))
                    }
                  />
                </div>
                <div>
                  <Label>End</Label>
                  <Input
                    type="time"
                    className="mt-1.5 min-h-11"
                    value={availabilityForm.end}
                    onChange={(e) =>
                      setAvailabilityForm((prev) => ({ ...prev, end: e.target.value }))
                    }
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="consumer-pressable min-h-11 w-full"
                variant="outline"
                disabled={savingAvailability}
              >
                {savingAvailability ? 'Saving…' : 'Save availability'}
              </Button>
            </form>
            {availability.length > 0 ? (
              <ul className="mt-4 divide-y divide-[var(--app-border)] text-sm text-[var(--text-muted)]">
                {availability.map((row, index) => (
                  <li key={`${row.weekday}-${index}`} className="py-2 first:pt-0 last:pb-0">
                    {WEEKDAYS[row.weekday]}:{' '}
                    {(row.availability?.blocks || [])
                      .map((b) => `${b.start}–${b.end}`)
                      .join(', ') || '—'}
                  </li>
                ))}
              </ul>
            ) : null}
          </PublicPanel>

          <PublicPanel title="Recent PTO requests">
            {ptoRequests.length === 0 ? (
              <EmptyState
                title="No PTO requests"
                description="Submit time off above when needed."
              />
            ) : (
              <div className="divide-y divide-[var(--app-border)]">
                {ptoRequests.map((request: StaffPortalDashboard['ptoRequests'][number]) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium text-[var(--text)]">{request.type}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {new Date(request.start_date).toLocaleDateString()} →{' '}
                        {new Date(request.end_date).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {request.status.toLowerCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </PublicPanel>
        </div>
      )}

      {activeTab === 'more' && (
        <div className="space-y-5">
          <PublicPanel title="Time entries">
            {timeEntries.length === 0 ? (
              <EmptyState
                title="No time entries yet"
                description="Clock in to start tracking time."
              />
            ) : (
              <ul className="divide-y divide-[var(--app-border)]">
                {timeEntries.slice(0, 15).map((entry: StaffTimeEntry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between py-3 text-sm first:pt-0 last:pb-0"
                  >
                    <span className="text-[var(--text-muted)]">
                      {new Date(entry.clockInAt).toLocaleDateString()} · In{' '}
                      {formatShiftTime(entry.clockInAt)}
                      {entry.clockOutAt ? ` → Out ${formatShiftTime(entry.clockOutAt)}` : ' (open)'}
                    </span>
                    <Badge variant={entry.clockOutAt ? 'secondary' : 'default'} className="text-xs">
                      {entry.clockOutAt ? 'Closed' : 'Open'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </PublicPanel>

          <PublicPanel title="Documents & resources">
            {documents.length === 0 ? (
              <EmptyState title="No documents" description="Nothing assigned right now." />
            ) : (
              <div className="divide-y divide-[var(--app-border)]">
                {documents.map((document: StaffPortalDashboard['documents'][number]) => (
                  <div
                    key={document.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-[var(--text)]">
                        {document.title ?? document.doc_type}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Uploaded {new Date(document.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                    <a
                      href={document.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="consumer-pressable shrink-0 text-sm font-medium text-[var(--brand-mid)] hover:text-[var(--brand)]"
                    >
                      View
                    </a>
                  </div>
                ))}
              </div>
            )}
          </PublicPanel>

          <PublicPanel title="Swap history">
            {swapRequests.length === 0 ? (
              <EmptyState
                title="No swap activity"
                description="Request a swap from the Shifts tab."
              />
            ) : (
              <div className="divide-y divide-[var(--app-border)]">
                {swapRequests.map((swap: StaffPortalDashboard['swapRequests'][number]) => (
                  <div
                    key={swap.id}
                    className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                  >
                    <div>
                      <p className="font-medium text-[var(--text)]">
                        {swap.reason || 'Shift swap request'}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {new Date(swap.created_at).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {swap.status.toLowerCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </PublicPanel>

          <Button
            variant="outline"
            className="consumer-pressable pwa-touch-target w-full sm:hidden"
            onClick={handleEndSession}
          >
            {magicLinkMode ? 'End session' : 'Sign out'}
          </Button>
        </div>
      )}
    </StaffPortalShell>
  )
}

export default StaffSelfServiceDashboard
