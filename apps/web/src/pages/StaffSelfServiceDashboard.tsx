import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import { ensureNamespace } from '../i18n'
import { getWeekdayLabels } from '../components/staff/staffShared'

const PTO_TYPE_VALUES = ['VACATION', 'SICK', 'PERSONAL', 'UNPAID', 'OTHER'] as const

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
  const { t } = useTranslation('staff')
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
  const weekdays = getWeekdayLabels(t)

  useEffect(() => {
    void ensureNamespace('staff')
  }, [])

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
      toast.error(t('portal.dashboard.endDateBeforeStart'))
      return
    }

    try {
      const body = {
        type: ptoForm.type as (typeof PTO_TYPE_VALUES)[number],
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
      toast.success(t('portal.dashboard.ptoSubmitted'))
      setPtoForm((prev) => ({ ...prev, reason: '' }))
      refetch()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('portal.dashboard.ptoSubmitFailed')))
    }
  }

  const handleSubmitSwap = async (event: React.FormEvent) => {
    event.preventDefault()
    if ((!magicLinkMode && !accountMode) || !swapForm.shiftId) {
      toast.error(t('portal.dashboard.selectShiftForSwap'))
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
      toast.success(t('portal.dashboard.swapSent'))
      setSwapForm((prev) => ({ ...prev, reason: '' }))
      refetch()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('portal.dashboard.swapSubmitFailed')))
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
      toast.success(t('portal.dashboard.announcementAcknowledged'))
      refetch()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('portal.dashboard.announcementAckFailed')))
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
      toast.success(t('portal.dashboard.availabilitySaved'))
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('portal.dashboard.availabilitySaveFailed')))
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
      toast.success(t('portal.dashboard.clockedIn'))
      refetchTimeEntries()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('portal.dashboard.clockInFailed')))
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
      toast.success(t('portal.dashboard.clockedOut'))
      refetchTimeEntries()
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, t('portal.dashboard.clockOutFailed')))
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
          {getApiErrorMessage(loadErrorDetail, t('portal.dashboard.loadFailed'))}
        </p>
        <Button variant="outline" className="consumer-pressable mt-4" onClick={() => refetch()}>
          {t('portal.dashboard.tryAgain')}
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
    ? t('portal.shell.clockedInSince', { time: formatShiftTime(openEntry.clockInAt) })
    : t('portal.shell.offTheClock')

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
      signOutLabel={magicLinkMode ? t('portal.shell.endSession') : t('portal.shell.signOut')}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      tabBadges={{ home: unreadAnnouncements }}
    >
      {activeTab === 'home' && (
        <div className="space-y-5">
          {nextShift ? (
            <PublicPanel title={t('portal.dashboard.nextShift')}>
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
                {t('portal.dashboard.viewAllShifts')}
                <ChevronRight className="ml-0.5 h-4 w-4" />
              </Button>
            </PublicPanel>
          ) : (
            <PublicPanel title={t('portal.dashboard.nextShift')}>
              <EmptyState
                title={t('portal.dashboard.noShiftsTitle')}
                description={t('portal.dashboard.noShiftsDescription')}
              />
            </PublicPanel>
          )}

          <PublicPanel
            title={t('portal.dashboard.announcements')}
            description={
              unreadAnnouncements > 0
                ? t('portal.dashboard.unreadCount', { count: unreadAnnouncements })
                : t('portal.dashboard.allCaughtUp')
            }
          >
            {announcements.length === 0 ? (
              <EmptyState
                title={t('portal.dashboard.noAnnouncementsTitle')}
                description={t('portal.dashboard.noAnnouncementsDescription')}
              />
            ) : (
              <div className="divide-y divide-[var(--app-border)]">
                {announcements.map(
                  (announcement: StaffPortalDashboard['announcements'][number]) => (
                    <div key={announcement.id} className="py-3 first:pt-0 last:pb-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-[var(--text)]">{announcement.title}</p>
                        <Badge variant={announcement.acknowledged ? 'secondary' : 'default'}>
                          {announcement.acknowledged
                            ? t('portal.dashboard.read')
                            : t('portal.dashboard.new')}
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
                          {t('portal.dashboard.acknowledge')}
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
          <PublicPanel
            title={t('portal.dashboard.myShifts')}
            description={t('portal.dashboard.myShiftsDescription')}
          >
            {upcomingShifts.length === 0 ? (
              <EmptyState
                title={t('portal.dashboard.noShiftsTitle')}
                description={t('portal.dashboard.noShiftsDescription')}
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

          <PublicPanel title={t('portal.dashboard.requestShiftSwap')}>
            <form className="space-y-3" onSubmit={handleSubmitSwap}>
              <div>
                <Label>{t('portal.dashboard.preferredCover')}</Label>
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
                    <SelectValue placeholder={t('portal.dashboard.selectTeammate')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">{t('portal.dashboard.noPreference')}</SelectItem>
                    {teammates.map((mate) => (
                      <SelectItem key={mate.id} value={mate.id}>
                        {mate.displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t('portal.dashboard.reason')}</Label>
                <Textarea
                  className="mt-1.5"
                  value={swapForm.reason}
                  placeholder={t('portal.dashboard.swapReasonPlaceholder')}
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
                {submittingSwap
                  ? t('portal.dashboard.submitting')
                  : t('portal.dashboard.sendSwapRequest')}
              </Button>
            </form>
          </PublicPanel>
        </div>
      )}

      {activeTab === 'requests' && (
        <div className="space-y-5">
          <PublicPanel title={t('portal.dashboard.requestTimeOff')}>
            <form className="space-y-3" onSubmit={handleSubmitPto}>
              <div>
                <Label>{t('portal.dashboard.type')}</Label>
                <Select
                  value={ptoForm.type}
                  onValueChange={(value) => setPtoForm((prev) => ({ ...prev, type: value }))}
                >
                  <SelectTrigger className="mt-1.5 min-h-11 w-full">
                    <SelectValue placeholder={t('portal.dashboard.selectType')} />
                  </SelectTrigger>
                  <SelectContent>
                    {PTO_TYPE_VALUES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(`shared.ptoType.${type}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>{t('portal.dashboard.startDate')}</Label>
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
                  <Label>{t('portal.dashboard.endDate')}</Label>
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
                <Label>{t('portal.dashboard.hoursOptional')}</Label>
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
                <Label>{t('portal.dashboard.reasonOptional')}</Label>
                <Textarea
                  className="mt-1.5"
                  value={ptoForm.reason}
                  placeholder={t('portal.dashboard.ptoReasonPlaceholder')}
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
                {submittingPto
                  ? t('portal.dashboard.submitting')
                  : t('portal.dashboard.submitRequest')}
              </Button>
            </form>
          </PublicPanel>

          <PublicPanel
            title={t('portal.dashboard.myAvailability')}
            description={t('portal.dashboard.myAvailabilityDescription')}
          >
            <form className="space-y-3" onSubmit={handleSaveAvailability}>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>{t('portal.dashboard.weekday')}</Label>
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
                      {weekdays.map((day, index) => (
                        <SelectItem key={day} value={String(index)}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t('portal.dashboard.start')}</Label>
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
                  <Label>{t('portal.dashboard.end')}</Label>
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
                {savingAvailability
                  ? t('portal.dashboard.saving')
                  : t('portal.dashboard.saveAvailability')}
              </Button>
            </form>
            {availability.length > 0 ? (
              <ul className="mt-4 divide-y divide-[var(--app-border)] text-sm text-[var(--text-muted)]">
                {availability.map((row, index) => (
                  <li key={`${row.weekday}-${index}`} className="py-2 first:pt-0 last:pb-0">
                    {weekdays[row.weekday]}:{' '}
                    {(row.availability?.blocks || [])
                      .map((b) => `${b.start}–${b.end}`)
                      .join(', ') || t('shared.emDash')}
                  </li>
                ))}
              </ul>
            ) : null}
          </PublicPanel>

          <PublicPanel title={t('portal.dashboard.recentPto')}>
            {ptoRequests.length === 0 ? (
              <EmptyState
                title={t('portal.dashboard.noPtoTitle')}
                description={t('portal.dashboard.noPtoDescription')}
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
          <PublicPanel title={t('portal.dashboard.timeEntries')}>
            {timeEntries.length === 0 ? (
              <EmptyState
                title={t('portal.dashboard.noTimeEntriesTitle')}
                description={t('portal.dashboard.noTimeEntriesDescription')}
              />
            ) : (
              <ul className="divide-y divide-[var(--app-border)]">
                {timeEntries.slice(0, 15).map((entry: StaffTimeEntry) => (
                  <li
                    key={entry.id}
                    className="flex items-center justify-between py-3 text-sm first:pt-0 last:pb-0"
                  >
                    <span className="text-[var(--text-muted)]">
                      {new Date(entry.clockInAt).toLocaleDateString()} ·{' '}
                      {t('portal.dashboard.timeEntryIn')} {formatShiftTime(entry.clockInAt)}
                      {entry.clockOutAt
                        ? ` → ${t('portal.dashboard.timeEntryOut', { time: formatShiftTime(entry.clockOutAt) })}`
                        : ` ${t('portal.dashboard.timeEntryOpen')}`}
                    </span>
                    <Badge variant={entry.clockOutAt ? 'secondary' : 'default'} className="text-xs">
                      {entry.clockOutAt ? t('shared.closed') : t('shared.open')}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </PublicPanel>

          <PublicPanel title={t('portal.dashboard.documentsResources')}>
            {documents.length === 0 ? (
              <EmptyState
                title={t('portal.dashboard.noDocumentsTitle')}
                description={t('portal.dashboard.noDocumentsDescription')}
              />
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
                        {t('portal.dashboard.uploaded', {
                          date: new Date(document.uploaded_at).toLocaleDateString(),
                        })}
                      </p>
                    </div>
                    <a
                      href={document.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="consumer-pressable shrink-0 text-sm font-medium text-[var(--brand-mid)] hover:text-[var(--brand)]"
                    >
                      {t('portal.dashboard.view')}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </PublicPanel>

          <PublicPanel title={t('portal.dashboard.swapHistory')}>
            {swapRequests.length === 0 ? (
              <EmptyState
                title={t('portal.dashboard.noSwapTitle')}
                description={t('portal.dashboard.noSwapDescription')}
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
                        {swap.reason || t('portal.dashboard.defaultSwapReason')}
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
            {magicLinkMode ? t('portal.shell.endSession') : t('portal.shell.signOut')}
          </Button>
        </div>
      )}
    </StaffPortalShell>
  )
}

export default StaffSelfServiceDashboard
