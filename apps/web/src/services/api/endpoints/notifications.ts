import { api } from '../base'
export const notificationsApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getNotifications: builder.query<any, any>({
      query: (params) => ({
        url: '/api/notifications',
        params,
      }),
      providesTags: ['Notification'],
      keepUnusedDataFor: 60,
    }),
    getUnreadNotificationCount: builder.query<{ unreadCount: number }, void>({
      query: () => '/api/notifications/unread-count',
      providesTags: ['Notification'],
      keepUnusedDataFor: 60,
    }),
    getNotificationPreferences: builder.query<any, void>({
      query: () => '/api/notifications/preferences',
      providesTags: ['Notification'],
      keepUnusedDataFor: 300,
    }),
    updateNotificationPreferences: builder.mutation<any, any>({
      query: (data) => ({
        url: '/api/notifications/preferences',
        method: 'PATCH',
        body: data,
      }),
      invalidatesTags: ['Notification'],
    }),
    markNotificationRead: builder.mutation<any, string>({
      query: (id) => ({
        url: `/api/notifications/${id}/read`,
        method: 'POST',
      }),
      invalidatesTags: ['Notification'],
    }),
    markAllNotificationsRead: builder.mutation<any, void>({
      query: () => ({
        url: '/api/notifications/read-all',
        method: 'POST',
      }),
      invalidatesTags: ['Notification'],
    }),
  }),
})
