import { api } from './api'
import type {
  ReservationBoardResponse,
  ReservationTable,
  Reservation,
  ReservationStatus,
  ReservationAnalyticsResponse,
} from '../types'

export const reservationsApi = api.injectEndpoints({
  endpoints: (build) => ({
    getReservationBoard: build.query<
      ReservationBoardResponse,
      { date?: string; branchId?: string }
    >({
      query: ({ date, branchId }) => ({
        url: '/api/reservations/board',
        params: {
          date,
          branchId,
        },
      }),
      providesTags: (_result) => [{ type: 'Reservation' as const, id: 'BOARD' }],
    }),
    saveReservationTables: build.mutation<
      { tables: ReservationTable[] },
      {
        branchId?: string
        tables: Array<
          Partial<ReservationTable> & {
            name: string
            capacity: number
            table_type?: string
            position?: Record<string, unknown>
            is_active?: boolean
          }
        >
      }
    >({
      query: ({ branchId, tables }) => ({
        url: '/api/reservations/tables',
        method: 'POST',
        body: {
          branchId,
          tables,
        },
      }),
      invalidatesTags: [{ type: 'Reservation' as const, id: 'BOARD' }],
    }),
    createReservation: build.mutation<{ reservation: Reservation }, Record<string, unknown>>({
      query: (body) => ({
        url: '/api/reservations',
        method: 'POST',
        body,
      }),
    }),
    updateReservationStatus: build.mutation<
      { reservation: Reservation },
      { id: string; status: ReservationStatus; notes?: string }
    >({
      query: ({ id, status, notes }) => ({
        url: `/api/reservations/${id}`,
        method: 'PATCH',
        body: { status, ...(notes != null && { notes }) },
      }),
      invalidatesTags: [{ type: 'Reservation' as const, id: 'BOARD' }],
    }),
    getReservationAnalytics: build.query<
      ReservationAnalyticsResponse,
      { range?: 'day' | 'week' | 'month'; branchId?: string }
    >({
      query: ({ range, branchId }) => ({
        url: '/api/reservations/analytics',
        params: {
          range,
          branchId,
        },
      }),
    }),
    getReservationWaitlist: build.query<{ waitlist: Array<Record<string, unknown>> }, void>({
      query: () => '/api/reservations/waitlist',
      providesTags: [{ type: 'Reservation' as const, id: 'WAITLIST' }],
    }),
    manuallyPromoteWaitlist: build.mutation<{ waitlist: Record<string, unknown> }, string>({
      query: (id) => ({
        url: `/api/reservations/waitlist/${id}/manually-promote`,
        method: 'POST',
      }),
      invalidatesTags: [
        { type: 'Reservation' as const, id: 'WAITLIST' },
        { type: 'Reservation' as const, id: 'BOARD' },
      ],
    }),
    getGuestIntelligence: build.query<
      {
        recentGuests: Array<Record<string, unknown>>
        repeatGuests: Array<Record<string, unknown>>
        vipGuests: Array<Record<string, unknown>>
        followUps: Array<Record<string, unknown>>
      },
      { branchId?: string }
    >({
      query: ({ branchId }) => ({
        url: '/api/reservations/guest-intelligence',
        params: { branchId },
      }),
      providesTags: [{ type: 'Reservation' as const, id: 'GUESTS' }],
    }),
  }),
  overrideExisting: false,
})

export const {
  useGetReservationBoardQuery,
  useSaveReservationTablesMutation,
  useCreateReservationMutation,
  useUpdateReservationStatusMutation,
  useGetReservationAnalyticsQuery,
  useGetGuestIntelligenceQuery,
  useGetReservationWaitlistQuery,
  useManuallyPromoteWaitlistMutation,
} = reservationsApi
