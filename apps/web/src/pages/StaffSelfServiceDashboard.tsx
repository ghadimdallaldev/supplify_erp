import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
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
import { toast } from 'react-hot-toast'
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
} from '../services/api'
import type { StaffPortalDashboard, StaffTimeEntry } from '../types'

const PTO_TYPES = [
  { value: 'VACATION', label: 'Vacation' },
  { value: 'SICK', label: 'Sick' },
  { value: 'PERSONAL', label: 'Personal' },
  { value: 'UNPAID', label: 'Unpaid' },
  { value: 'OTHER', label: 'Other' },
]

function useStaffToken() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const token = searchParams.get('token')

  useEffect(() => {
    if (token) {
      localStorage.setItem('staff.portal.token', token)
    }
  }, [token])

  const storedToken = useMemo(() => localStorage.getItem('staff.portal.token'), [location.key])

  return token ?? storedToken ?? ''
}

export function StaffSelfServiceDashboard() {
  const navigate = useNavigate()
  const token = useStaffToken()
  const magicLinkMode = Boolean(token)

  const { data: me } = useGetMeQuery(undefined, { skip: magicLinkMode })
  const accountMode =
    !magicLinkMode && (me?.role === 'STAFF_PORTAL' || me?.accessType === 'staff_portal')

  const {
    data: magicData,
    isLoading: magicLoading,
    refetch: refetchMagic,
  } = useGetStaffPortalDashboardQuery({ token }, { skip: !magicLinkMode })
  const {
    data: accountData,
    isLoading: accountLoading,
    refetch: refetchAccount,
  } = useGetStaffSelfDashboardQuery(undefined, { skip: !accountMode })

  const data = magicLinkMode ? magicData : accountData
  const isLoading = magicLinkMode ? magicLoading : accountLoading
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

  const handleSubmitPto = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!magicLinkMode && !accountMode) return
    if (new Date(ptoForm.endDate) < new Date(ptoForm.startDate)) {
      toast.error('End date cannot be before start date')
      return
    }

    try {
      const body = {
        type: ptoForm.type as any,
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
    } catch (error: any) {
      toast.error(
        error?.data?.message || error?.data?.error?.message || 'Unable to submit PTO request'
      )
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
    } catch (error: any) {
      toast.error(
        error?.data?.message || error?.data?.error?.message || 'Unable to submit shift swap request'
      )
    }
  }

  const openEntry = timeEntries.find((e: StaffTimeEntry) => !e.clockOutAt)
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
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to clock in')
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
    } catch (error: any) {
      toast.error(error?.data?.error?.message || 'Unable to clock out')
    }
  }

  if (!magicLinkMode && !accountMode && !isLoading) {
    return null
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-slate-900/90 px-4 py-12" role="status" aria-live="polite">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <Skeleton className="h-10 w-64 bg-white/10" />
          <Skeleton className="h-32 w-full rounded-lg bg-white/10" />
          <Skeleton className="h-48 w-full rounded-lg bg-white/10" />
        </div>
      </div>
    )
  }

  const { staff, upcomingShifts, ptoRequests, swapRequests, announcements, documents } = data

  return (
    <div className="min-h-screen bg-slate-900/90 py-12 px-4">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="flex flex-col items-start justify-between gap-3 text-white lg:flex-row lg:items-center">
          <div>
            <p className="text-sm uppercase tracking-wide text-[var(--text-muted)]">Welcome back</p>
            <h1 className="text-3xl font-bold tracking-tight">{staff.display_name}</h1>
            <p className="text-sm text-[var(--text-muted)]">Role: {staff.role}</p>
            <p className="mt-1 max-w-xl text-xs text-slate-400">
              Staff portal — view your schedule, clock in/out, and submit requests. Restaurant
              managers use the main app under Staff operations.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="bg-[var(--mint-pale)]/10 text-[var(--mint)]">
              {upcomingShifts.length} upcoming shifts
            </Badge>
            <Badge
              variant="secondary"
              className="bg-[var(--brand-pale)]/10 text-[var(--brand-mid)]"
            >
              {announcements.length} announcements
            </Badge>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Refresh data
            </Button>
          </div>
        </header>

        <Card className="border-[var(--mint)]/35 bg-[var(--mint-pale)]/50 dark:border-[var(--mint)]/50 dark:bg-[var(--mint)]/15">
          <CardHeader>
            <CardTitle>Time clock</CardTitle>
            <CardDescription>
              Clock in when you start and clock out when you leave. Your recent check-ins are listed
              below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {openEntry ? (
                <>
                  <p className="text-sm font-medium text-[var(--mint)] dark:text-[var(--mint)]">
                    Clocked in since{' '}
                    {new Date(openEntry.clockInAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleClockOut}
                    disabled={checkingOut}
                    className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
                  >
                    {checkingOut ? 'Clocking out…' : 'Clock out'}
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={handleClockIn}
                  disabled={checkingIn}
                  className="bg-[var(--mint)] hover:opacity-90"
                >
                  {checkingIn ? 'Clocking in…' : 'Clock in'}
                </Button>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">
                Recent check-ins & check-outs
              </p>
              {timeEntries.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No time entries yet. Clock in to start.
                </p>
              ) : (
                <ul className="space-y-2">
                  {timeEntries.slice(0, 15).map((entry: StaffTimeEntry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between rounded-lg border border-[var(--app-border)] bg-white px-3 py-2 text-sm dark:border-[var(--app-border-mid)] dark:bg-[var(--text)]"
                    >
                      <span className="text-[var(--text-muted)] dark:text-[var(--text-muted)]">
                        {new Date(entry.clockInAt).toLocaleDateString()} · In{' '}
                        {new Date(entry.clockInAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                        {entry.clockOutAt
                          ? ` → Out ${new Date(entry.clockOutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                          : ' (open)'}
                      </span>
                      <Badge
                        variant={entry.clockOutAt ? 'secondary' : 'default'}
                        className="text-xs"
                      >
                        {entry.clockOutAt ? 'Closed' : 'Open'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Upcoming shifts</CardTitle>
              <CardDescription>
                Tap a shift to request a swap or mark your availability.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingShifts.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No scheduled shifts yet. Check back soon!
                </p>
              ) : (
                upcomingShifts.map((shift: StaffPortalDashboard['upcomingShifts'][number]) => (
                  <div
                    key={shift.id}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
                      swapForm.shiftId === shift.id
                        ? 'border-[var(--brand)] bg-[var(--brand-pale)] text-[var(--brand-mid)]'
                        : 'border-[var(--app-border)]'
                    }`}
                  >
                    <div>
                      <p className="font-semibold text-[var(--text)]">{shift.role}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {new Date(shift.shift_date).toLocaleDateString()} •{' '}
                        {new Date(shift.starts_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        –{' '}
                        {new Date(shift.ends_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {shift.status.toLowerCase()}
                    </Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Request time off</CardTitle>
                <CardDescription>
                  Managers will review and respond in the staff app.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={handleSubmitPto}>
                  <div>
                    <Label>Type</Label>
                    <Select
                      value={ptoForm.type}
                      onValueChange={(value) => setPtoForm((prev) => ({ ...prev, type: value }))}
                    >
                      <SelectTrigger>
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
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <Label>Start date</Label>
                      <Input
                        type="date"
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
                      value={ptoForm.hoursRequested}
                      onChange={(event) =>
                        setPtoForm((prev) => ({ ...prev, hoursRequested: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Reason (optional)</Label>
                    <Textarea
                      value={ptoForm.reason}
                      placeholder="Tell your manager why you need time off."
                      onChange={(event) =>
                        setPtoForm((prev) => ({ ...prev, reason: event.target.value }))
                      }
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={submittingPto}>
                    {submittingPto ? 'Submitting…' : 'Submit request'}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Request shift swap</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-3" onSubmit={handleSubmitSwap}>
                  <div>
                    <Label>Shift</Label>
                    <Select
                      value={swapForm.shiftId}
                      onValueChange={(value) =>
                        setSwapForm((prev) => ({ ...prev, shiftId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select shift" />
                      </SelectTrigger>
                      <SelectContent>
                        {upcomingShifts.map(
                          (shift: StaffPortalDashboard['upcomingShifts'][number]) => (
                            <SelectItem key={shift.id} value={shift.id}>
                              {new Date(shift.shift_date).toLocaleDateString()} – {shift.role}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Preferred cover (optional)</Label>
                    <Input
                      placeholder="Enter teammate ID if you have a cover in mind"
                      value={swapForm.proposedCoverId}
                      onChange={(event) =>
                        setSwapForm((prev) => ({ ...prev, proposedCoverId: event.target.value }))
                      }
                    />
                  </div>
                  <div>
                    <Label>Reason</Label>
                    <Textarea
                      value={swapForm.reason}
                      placeholder="Why do you need a swap?"
                      onChange={(event) =>
                        setSwapForm((prev) => ({ ...prev, reason: event.target.value }))
                      }
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={submittingSwap || !swapForm.shiftId}
                  >
                    {submittingSwap ? 'Submitting…' : 'Send swap request'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Announcements</CardTitle>
              <CardDescription>
                Stay updated with important messages from leadership.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {announcements.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  No announcements yet. Check again soon.
                </p>
              ) : (
                announcements.map((announcement: StaffPortalDashboard['announcements'][number]) => (
                  <div
                    key={announcement.id}
                    className="rounded-xl border border-[var(--app-border)] p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-[var(--text)]">{announcement.title}</p>
                      <Badge variant={announcement.acknowledged ? 'default' : 'outline'}>
                        {announcement.acknowledged ? 'Acknowledged' : 'Unread'}
                      </Badge>
                    </div>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">{announcement.body}</p>
                    <p className="mt-3 text-xs text-[var(--text-muted)]">
                      Posted {new Date(announcement.published_at).toLocaleString()}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents & resources</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {documents.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">
                  You’re all caught up! No documents assigned right now.
                </p>
              ) : (
                documents.map((document: StaffPortalDashboard['documents'][number]) => (
                  <div
                    key={document.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--app-border)] p-4"
                  >
                    <div>
                      <p className="font-medium text-[var(--text)]">
                        {document.title ?? document.doc_type}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Uploaded {new Date(document.uploaded_at).toLocaleDateString()}
                        {document.expires_at
                          ? ` • Expires ${new Date(document.expires_at).toLocaleDateString()}`
                          : ''}
                      </p>
                    </div>
                    <a
                      href={document.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs font-medium text-[var(--brand-mid)] hover:underline"
                    >
                      View
                    </a>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent PTO requests</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {ptoRequests.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No requests submitted yet.</p>
              ) : (
                ptoRequests.map((request: StaffPortalDashboard['ptoRequests'][number]) => (
                  <div
                    key={request.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--app-border)] px-4 py-3 text-sm"
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
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Swap history</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {swapRequests.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No swap activity yet.</p>
              ) : (
                swapRequests.map((swap: StaffPortalDashboard['swapRequests'][number]) => (
                  <div
                    key={swap.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--app-border)] px-4 py-3 text-sm"
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
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default StaffSelfServiceDashboard
