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
    getReservationBoard: build.query<ReservationBoardResponse, { date?: string; branchId?: string }>({
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
      { branchId?: string; tables: Array<Partial<ReservationTable> & { name: string; capacity: number; table_type?: string; position?: Record<string, unknown>; is_active?: boolean }> }
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
    updateReservationStatus: build.mutation<{ reservation: Reservation }, { id: string; status: ReservationStatus; cancellationReason?: string }>({
      query: ({ id, ...data }) => ({
        url: `/api/reservations/${id}/status`,
        method: 'PATCH',
        body: data,
      }),
    }),
    getReservationAnalytics: build.query<ReservationAnalyticsResponse, { range?: 'day' | 'week' | 'month'; branchId?: string }>({
      query: ({ range, branchId }) => ({
        url: '/api/reservations/analytics',
        params: {
          period: range,
          branchId,
        },
      }),
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
} = reservationsApi
