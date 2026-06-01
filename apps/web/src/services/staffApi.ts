import { api } from './api'
import type {
  StaffMember,
  StaffShift,
  StaffTimeEntry,
  StaffWageType,
  StaffShiftStatus,
  StaffTimeEntryStatus,
  StaffPtoRequest,
  StaffAvailability,
  StaffShiftSwap,
  StaffAnnouncement,
  StaffDocument,
  StaffIncident,
  StaffPerformanceNote,
  StaffPayrollExport,
} from '../types'
import { normalizeListResponse } from '../lib/apiError'

interface CreateStaffMemberInput {
  firstName: string
  lastName: string
  displayName?: string
  email?: string
  phone?: string
  role: string
  wageType?: StaffWageType
  wageRate?: number
  hireDate?: string
  profileColor?: string
}

interface UpdateStaffMemberInput extends Partial<CreateStaffMemberInput> {
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
}

interface CreateShiftInput {
  staffId?: string
  role: string
  shiftDate: string
  startsAt: string
  endsAt: string
  status?: StaffShiftStatus
  notes?: string
}

interface UpdateShiftInput extends Partial<CreateShiftInput> {}

interface CheckInInput {
  staffId: string
  shiftId?: string
  clockInAt?: string
  method?: string
  note?: string
}

interface CheckOutInput {
  id: string
  clockOutAt?: string
  method?: string
  breakMinutes?: number
  note?: string
  status?: StaffTimeEntryStatus
}

interface CreatePtoInput {
  staffId: string
  type: 'VACATION' | 'SICK' | 'PERSONAL' | 'UNPAID' | 'OTHER'
  startDate: string
  endDate: string
  hoursRequested?: number
  reason?: string
}

interface UpdatePtoInput {
  id: string
  status: 'PENDING' | 'APPROVED' | 'DECLINED' | 'CANCELLED'
  managerNote?: string
}

interface SetAvailabilityInput {
  staffId: string
  weekday: number
  availability: { blocks: Array<{ start: string; end: string }> }
  notes?: string
}

interface CreateSwapInput {
  shiftId: string
  requestedBy: string
  proposedCoverId?: string
  reason?: string
}

interface DecideSwapInput {
  id: string
  status: 'REQUESTED' | 'APPROVED' | 'DECLINED' | 'CANCELLED' | 'COMPLETED'
  managerNote?: string
}

interface CreateAnnouncementInput {
  title: string
  body: string
  requireAck?: boolean
  audience?: {
    roles?: string[]
    staffIds?: string[]
  }
}

interface AcknowledgeAnnouncementInput {
  id: string
  staffId: string
}

interface CreateDocumentInput {
  staffId: string
  docType: string
  title?: string
  fileUrl: string
  fileSize?: number
  expiresAt?: string
  status?: 'ACTIVE' | 'EXPIRED' | 'RENEWAL_REQUIRED'
  metadata?: Record<string, unknown>
}

interface CreateIncidentInput {
  staffId?: string
  category: string
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  occurredAt: string
  notes?: string
  followUpAction?: string
  attachments?: Record<string, unknown>
}

interface CreatePerformanceNoteInput {
  staffId: string
  noteType?: 'COACHING' | 'KUDOS' | 'GENERAL'
  body: string
}

interface CreatePayrollExportInput {
  periodStart: string
  periodEnd: string
  totals?: Record<string, unknown>
  exportUrl?: string
}

export const staffApi = api.injectEndpoints({
  endpoints: (build) => ({
    getStaffMembers: build.query<StaffMember[], void>({
      query: () => ({
        url: '/api/staff/members',
      }),
      transformResponse: (response: unknown) => normalizeListResponse<StaffMember>(response),
      providesTags: (result) =>
        result
          ? [
              ...result.map((member) => ({ type: 'StaffMember' as const, id: member.id })),
              { type: 'StaffMember' as const, id: 'LIST' },
            ]
          : [{ type: 'StaffMember' as const, id: 'LIST' }],
    }),
    createStaffMember: build.mutation<StaffMember, CreateStaffMemberInput>({
      query: (body) => ({
        url: '/api/staff/members',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'StaffMember', id: 'LIST' }],
    }),
    updateStaffMember: build.mutation<StaffMember, { id: string; data: UpdateStaffMemberInput }>({
      query: ({ id, data }) => ({
        url: `/api/staff/members/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (result) =>
        result
          ? [
              { type: 'StaffMember', id: result.id },
              { type: 'StaffMember', id: 'LIST' },
            ]
          : [{ type: 'StaffMember', id: 'LIST' }],
    }),
    getStaffShifts: build.query<StaffShift[], { startDate?: string; endDate?: string }>({
      query: ({ startDate, endDate }) => ({
        url: '/api/staff/shifts',
        params: {
          startDate,
          endDate,
        },
      }),
      transformResponse: (response: unknown) => normalizeListResponse<StaffShift>(response),
      providesTags: (result) =>
        result
          ? [
              ...result.map((shift) => ({ type: 'StaffShift' as const, id: shift.id })),
              { type: 'StaffShift' as const, id: 'LIST' },
            ]
          : [{ type: 'StaffShift' as const, id: 'LIST' }],
    }),
    createStaffShift: build.mutation<StaffShift, CreateShiftInput>({
      query: (body) => ({
        url: '/api/staff/shifts',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'StaffShift', id: 'LIST' }],
    }),
    updateStaffShift: build.mutation<StaffShift, { id: string; data: UpdateShiftInput }>({
      query: ({ id, data }) => ({
        url: `/api/staff/shifts/${id}`,
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: (result) =>
        result
          ? [
              { type: 'StaffShift', id: result.id },
              { type: 'StaffShift', id: 'LIST' },
            ]
          : [{ type: 'StaffShift', id: 'LIST' }],
    }),
    deleteStaffShift: build.mutation<void, string>({
      query: (id) => ({
        url: `/api/staff/shifts/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'StaffShift', id: 'LIST' }],
    }),
    getStaffTimeEntries: build.query<StaffTimeEntry[], { startDate?: string; endDate?: string }>({
      query: ({ startDate, endDate }) => ({
        url: '/api/staff/time-entries',
        params: {
          startDate,
          endDate,
        },
      }),
      transformResponse: (response: unknown) => normalizeListResponse<StaffTimeEntry>(response),
      providesTags: (result) =>
        result
          ? [
              ...result.map((entry) => ({ type: 'StaffTimeEntry' as const, id: entry.id })),
              { type: 'StaffTimeEntry' as const, id: 'LIST' },
            ]
          : [{ type: 'StaffTimeEntry' as const, id: 'LIST' }],
    }),
    checkInStaffMember: build.mutation<StaffTimeEntry, CheckInInput>({
      query: (body) => ({
        url: '/api/staff/time-entries/check-in',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'StaffTimeEntry', id: 'LIST' }],
    }),
    checkOutTimeEntry: build.mutation<StaffTimeEntry, CheckOutInput>({
      query: ({ id, ...body }) => ({
        url: `/api/staff/time-entries/${id}/check-out`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'StaffTimeEntry', id: 'LIST' }],
    }),
    getStaffPtoRequests: build.query<StaffPtoRequest[], void>({
      query: () => ({
        url: '/api/staff/pto',
      }),
      transformResponse: (response: unknown) => normalizeListResponse<StaffPtoRequest>(response),
      providesTags: (result) =>
        result
          ? [
              ...result.map((pto) => ({ type: 'StaffPto' as const, id: pto.id })),
              { type: 'StaffPto' as const, id: 'LIST' },
            ]
          : [{ type: 'StaffPto' as const, id: 'LIST' }],
    }),
    createStaffPtoRequest: build.mutation<StaffPtoRequest, CreatePtoInput>({
      query: (body) => ({
        url: '/api/staff/pto',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'StaffPto', id: 'LIST' }],
    }),
    updateStaffPtoRequest: build.mutation<StaffPtoRequest, UpdatePtoInput>({
      query: ({ id, status, managerNote }) => ({
        url: `/api/staff/pto/${id}`,
        method: 'PATCH',
        body: { status, managerNote },
      }),
      invalidatesTags: (result) =>
        result
          ? [
              { type: 'StaffPto', id: result.id },
              { type: 'StaffPto', id: 'LIST' },
            ]
          : [{ type: 'StaffPto', id: 'LIST' }],
    }),
    getStaffAvailability: build.query<StaffAvailability[], void>({
      query: () => ({
        url: '/api/staff/availability',
      }),
      transformResponse: (response: unknown) => normalizeListResponse<StaffAvailability>(response),
      providesTags: [{ type: 'StaffAvailability', id: 'LIST' }],
    }),
    setStaffAvailability: build.mutation<StaffAvailability, SetAvailabilityInput>({
      query: (body) => ({
        url: '/api/staff/availability',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'StaffAvailability', id: 'LIST' }],
    }),
    getStaffSwaps: build.query<StaffShiftSwap[], void>({
      query: () => ({
        url: '/api/staff/swaps',
      }),
      transformResponse: (response: unknown) => normalizeListResponse<StaffShiftSwap>(response),
      providesTags: (result) =>
        result
          ? [
              ...result.map((swap) => ({ type: 'StaffSwap' as const, id: swap.id })),
              { type: 'StaffSwap' as const, id: 'LIST' },
            ]
          : [{ type: 'StaffSwap' as const, id: 'LIST' }],
    }),
    createStaffSwap: build.mutation<StaffShiftSwap, CreateSwapInput>({
      query: (body) => ({
        url: '/api/staff/swaps',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'StaffSwap', id: 'LIST' }],
    }),
    decideStaffSwap: build.mutation<StaffShiftSwap, DecideSwapInput>({
      query: ({ id, status, managerNote }) => ({
        url: `/api/staff/swaps/${id}/decision`,
        method: 'POST',
        body: { status, managerNote },
      }),
      invalidatesTags: (result) =>
        result
          ? [
              { type: 'StaffSwap', id: result.id },
              { type: 'StaffSwap', id: 'LIST' },
            ]
          : [{ type: 'StaffSwap', id: 'LIST' }],
    }),
    getStaffAnnouncements: build.query<StaffAnnouncement[], { staffId?: string } | void>({
      query: (params) => ({
        url: '/api/staff/announcements',
        params,
      }),
      transformResponse: (response: unknown) => normalizeListResponse<StaffAnnouncement>(response),
      providesTags: (result) =>
        result
          ? [
              ...result.map((announcement) => ({
                type: 'StaffAnnouncement' as const,
                id: announcement.id,
              })),
              { type: 'StaffAnnouncement' as const, id: 'LIST' },
            ]
          : [{ type: 'StaffAnnouncement' as const, id: 'LIST' }],
    }),
    createStaffAnnouncement: build.mutation<StaffAnnouncement, CreateAnnouncementInput>({
      query: (body) => ({
        url: '/api/staff/announcements',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'StaffAnnouncement', id: 'LIST' }],
    }),
    acknowledgeStaffAnnouncement: build.mutation<void, AcknowledgeAnnouncementInput>({
      query: ({ id, staffId }) => ({
        url: `/api/staff/announcements/${id}/ack`,
        method: 'POST',
        body: { staffId },
      }),
      invalidatesTags: (result, error, { id }) => [{ type: 'StaffAnnouncement', id }],
    }),
    getStaffDocuments: build.query<StaffDocument[], void>({
      query: () => ({
        url: '/api/staff/documents',
      }),
      transformResponse: (response: unknown) => normalizeListResponse<StaffDocument>(response),
      providesTags: (result) =>
        result
          ? [
              ...result.map((doc) => ({ type: 'StaffDocument' as const, id: doc.id })),
              { type: 'StaffDocument' as const, id: 'LIST' },
            ]
          : [{ type: 'StaffDocument' as const, id: 'LIST' }],
    }),
    createStaffDocument: build.mutation<StaffDocument, CreateDocumentInput>({
      query: (body) => ({
        url: '/api/staff/documents',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'StaffDocument', id: 'LIST' }],
    }),
    getStaffIncidents: build.query<StaffIncident[], void>({
      query: () => ({
        url: '/api/staff/incidents',
      }),
      transformResponse: (response: unknown) => normalizeListResponse<StaffIncident>(response),
      providesTags: (result) =>
        result
          ? [
              ...result.map((incident) => ({ type: 'StaffIncident' as const, id: incident.id })),
              { type: 'StaffIncident' as const, id: 'LIST' },
            ]
          : [{ type: 'StaffIncident' as const, id: 'LIST' }],
    }),
    createStaffIncident: build.mutation<StaffIncident, CreateIncidentInput>({
      query: (body) => ({
        url: '/api/staff/incidents',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'StaffIncident', id: 'LIST' }],
    }),
    getStaffPerformanceNotes: build.query<StaffPerformanceNote[], void>({
      query: () => ({
        url: '/api/staff/performance-notes',
      }),
      transformResponse: (response: unknown) =>
        normalizeListResponse<StaffPerformanceNote>(response),
      providesTags: (result) =>
        result
          ? [
              ...result.map((note) => ({ type: 'StaffPerformance' as const, id: note.id })),
              { type: 'StaffPerformance' as const, id: 'LIST' },
            ]
          : [{ type: 'StaffPerformance' as const, id: 'LIST' }],
    }),
    createStaffPerformanceNote: build.mutation<StaffPerformanceNote, CreatePerformanceNoteInput>({
      query: (body) => ({
        url: '/api/staff/performance-notes',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'StaffPerformance', id: 'LIST' }],
    }),
    getStaffPayrollExports: build.query<StaffPayrollExport[], void>({
      query: () => ({
        url: '/api/staff/payroll',
      }),
      transformResponse: (response: unknown) => normalizeListResponse<StaffPayrollExport>(response),
      providesTags: (result) =>
        result
          ? [
              ...result.map((exportRow) => ({ type: 'StaffPayroll' as const, id: exportRow.id })),
              { type: 'StaffPayroll' as const, id: 'LIST' },
            ]
          : [{ type: 'StaffPayroll' as const, id: 'LIST' }],
    }),
    createStaffPayrollExport: build.mutation<StaffPayrollExport, CreatePayrollExportInput>({
      query: (body) => ({
        url: '/api/staff/payroll',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'StaffPayroll', id: 'LIST' }],
    }),
    getStaffPortalAccess: build.query<
      {
        staffId: string
        email?: string | null
        hasAccount: boolean
        portalAccessEnabled: boolean
        status: string
        loginUrl: string
        invitedAt?: string | null
        lastLoginAt?: string | null
        disabledAt?: string | null
      },
      string
    >({
      query: (staffId) => `/api/staff/members/${staffId}/portal`,
    }),
    createStaffPortalAccount: build.mutation<
      { temporaryPassword?: string; status: string; loginUrl: string },
      string
    >({
      query: (staffId) => ({
        url: `/api/staff/members/${staffId}/portal/create-account`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: (_r, _e, staffId) => [
        { type: 'StaffMember', id: staffId },
        { type: 'StaffMember', id: 'LIST' },
      ],
    }),
    sendStaffPortalInvite: build.mutation<{ status: string; loginUrl: string }, string>({
      query: (staffId) => ({
        url: `/api/staff/members/${staffId}/portal/send-invite`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: (_r, _e, staffId) => [{ type: 'StaffMember', id: staffId }],
    }),
    getStaffPortalLoginLink: build.query<{ loginUrl: string; status: string }, string>({
      query: (staffId) => `/api/staff/members/${staffId}/portal/login-link`,
    }),
    resetStaffPortalAccess: build.mutation<{ temporaryPassword?: string; status: string }, string>({
      query: (staffId) => ({
        url: `/api/staff/members/${staffId}/portal/reset-access`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: (_r, _e, staffId) => [{ type: 'StaffMember', id: staffId }],
    }),
    disableStaffPortalAccess: build.mutation<{ status: string }, string>({
      query: (staffId) => ({
        url: `/api/staff/members/${staffId}/portal/disable`,
        method: 'POST',
        body: {},
      }),
      invalidatesTags: (_r, _e, staffId) => [
        { type: 'StaffMember', id: staffId },
        { type: 'StaffMember', id: 'LIST' },
      ],
    }),
  }),
  overrideExisting: false,
})

export const {
  useGetStaffMembersQuery,
  useCreateStaffMemberMutation,
  useUpdateStaffMemberMutation,
  useGetStaffShiftsQuery,
  useCreateStaffShiftMutation,
  useUpdateStaffShiftMutation,
  useDeleteStaffShiftMutation,
  useGetStaffTimeEntriesQuery,
  useCheckInStaffMemberMutation,
  useCheckOutTimeEntryMutation,
  useGetStaffPtoRequestsQuery,
  useCreateStaffPtoRequestMutation,
  useUpdateStaffPtoRequestMutation,
  useGetStaffAvailabilityQuery,
  useSetStaffAvailabilityMutation,
  useGetStaffSwapsQuery,
  useCreateStaffSwapMutation,
  useDecideStaffSwapMutation,
  useGetStaffAnnouncementsQuery,
  useCreateStaffAnnouncementMutation,
  useAcknowledgeStaffAnnouncementMutation,
  useGetStaffDocumentsQuery,
  useCreateStaffDocumentMutation,
  useGetStaffIncidentsQuery,
  useCreateStaffIncidentMutation,
  useGetStaffPerformanceNotesQuery,
  useCreateStaffPerformanceNoteMutation,
  useGetStaffPayrollExportsQuery,
  useCreateStaffPayrollExportMutation,
  useGetStaffPortalAccessQuery,
  useCreateStaffPortalAccountMutation,
  useSendStaffPortalInviteMutation,
  useLazyGetStaffPortalLoginLinkQuery,
  useResetStaffPortalAccessMutation,
  useDisableStaffPortalAccessMutation,
} = staffApi
