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
      invalidatesTags: [{ type: 'Reservation' as const, id: 'BOARD' }],
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
    assignReservationTables: build.mutation<
      { reservation: Reservation },
      { id: string; tableIds: string[]; boardDate?: string; branchId?: string }
    >({
      query: ({ id, tableIds }) => ({
        url: `/api/reservations/${id}/tables`,
        method: 'PATCH',
        body: { tableIds },
      }),
      invalidatesTags: [{ type: 'Reservation' as const, id: 'BOARD' }],
      async onQueryStarted({ id, tableIds, boardDate, branchId }, { dispatch, queryFulfilled }) {
        if (!boardDate) return
        const boardArgs = { date: boardDate, ...(branchId ? { branchId } : {}) }
        const patch = dispatch(
          reservationsApi.util.updateQueryData('getReservationBoard', boardArgs, (draft) => {
            const reservation = draft.reservations.find((r) => r.id === id)
            if (reservation) {
              reservation.tables = tableIds
              reservation.updated_at = new Date().toISOString()
            }
          })
        )
        try {
          const { data } = await queryFulfilled
          if (data?.reservation?.tables?.length) {
            dispatch(
              reservationsApi.util.updateQueryData('getReservationBoard', boardArgs, (draft) => {
                const reservation = draft.reservations.find((r) => r.id === id)
                if (reservation) {
                  reservation.tables = data.reservation.tables
                }
              })
            )
          }
        } catch {
          patch.undo()
        }
      },
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
    getReservationWaitlist: build.query<
      { waitlist: Array<Record<string, unknown>> },
      { branchId?: string } | void
    >({
      query: (args) => ({
        url: '/api/reservations/waitlist',
        params: args?.branchId ? { branchId: args.branchId } : undefined,
      }),
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
    getPublicBookingSettings: build.query<
      {
        openTime: string
        closeTime: string
        usesCustomHours: boolean
        note: string
        tableCount: number
        totalCapacity: number
        durationMinutes?: number
        slotIntervalMinutes?: number
      },
      void
    >({
      query: () => '/api/reservations/public-booking-settings',
      providesTags: [{ type: 'Reservation' as const, id: 'BOOKING_SETTINGS' }],
    }),
    updatePublicBookingSettings: build.mutation<
      {
        openTime: string
        closeTime: string
        usesCustomHours: boolean
        note: string
        tableCount: number
        totalCapacity: number
        durationMinutes?: number
        slotIntervalMinutes?: number
      },
      {
        openTime: string
        closeTime: string
        durationMinutes?: number
        slotIntervalMinutes?: number
      }
    >({
      query: (body) => ({
        url: '/api/reservations/public-booking-settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: [{ type: 'Reservation' as const, id: 'BOOKING_SETTINGS' }],
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
  useAssignReservationTablesMutation,
  useGetReservationAnalyticsQuery,
  useGetGuestIntelligenceQuery,
  useGetReservationWaitlistQuery,
  useManuallyPromoteWaitlistMutation,
  useGetPublicBookingSettingsQuery,
  useUpdatePublicBookingSettingsMutation,
} = reservationsApi
