import { api } from './api'
import type {
  StaffMember,
  StaffShift,
  StaffTimeEntry,
  StaffWageType,
  StaffShiftStatus,
  StaffTimeEntryStatus,
} from '../types'

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

export const staffApi = api.injectEndpoints({
  endpoints: (build) => ({
    getStaffMembers: build.query<StaffMember[], void>({
      query: () => ({
        url: '/api/staff/members',
      }),
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
} = staffApi

