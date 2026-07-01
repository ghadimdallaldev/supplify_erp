import { api } from '../base'
export type SupplierStatementSummary = {
  openingBalance: number
  totalCharges: number
  totalPayments: number
  totalAdjustments: number
  closingBalance: number
  invoiceCount?: number
}

export type SupplierStatementInvoice = {
  id: string
  invoice_number?: string
  invoice_date?: string
  total_amount?: string | number
  total_paid?: string | number
  supplier_name?: string
  status?: string
}

export type SupplierStatementResponse = {
  invoices: SupplierStatementInvoice[]
  summary: SupplierStatementSummary
}

export type SupplierStatementQueryArgs = {
  supplierId: string
  startDate: string
  endDate: string
}

export const financeApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getRestaurantInvoices: builder.query<any, any>({
      query: (params) => ({
        url: '/api/restaurant-finance/invoices',
        params,
      }),
      providesTags: ['RestaurantFinance'],
    }),
    getRestaurantInvoice: builder.query<any, string>({
      query: (id) => `/api/restaurant-finance/invoices/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'RestaurantFinance', id }],
    }),
    // Enhanced payment with partial payment, credits, and HQ support
    markInvoicePaid: builder.mutation<any, { invoiceId: string; data: any }>({
      query: ({ invoiceId, data }) => ({
        url: `/api/restaurant-finance/invoices/${invoiceId}/pay`,
        method: 'POST',
        body: data,
      }),
      invalidatesTags: (_result, _error, { invoiceId }) => [
        { type: 'RestaurantFinance', id: invoiceId },
        'RestaurantFinance',
        'Order',
      ],
    }),
    recordSupplierPayment: builder.mutation<
      { payment: unknown },
      {
        invoice_id: string
        payment_amount: number
        payment_date: string
        payment_method: string
        payment_reference?: string
        bank_name?: string
        notes?: string
      }
    >({
      query: (body) => ({
        url: '/api/payments',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['RestaurantFinance', 'Order'],
    }),
    getInvoiceCredits: builder.query<any, string>({
      query: (invoiceId) => `/api/restaurant-finance/invoices/${invoiceId}/credits`,
      providesTags: ['RestaurantFinance'],
    }),
    getInvoiceAnalytics: builder.query<any, { period?: number }>({
      query: ({ period = 30 }) => ({
        url: '/api/restaurant-finance/invoices/analytics',
        params: { period },
      }),
      providesTags: ['RestaurantFinance'],
    }),
    getOrderInvoices: builder.query<any, string>({
      query: (orderId) => `/api/restaurant-finance/orders/${orderId}/invoices`,
      providesTags: (_result, _error, orderId) => [
        { type: 'Order', id: orderId },
        'RestaurantFinance',
      ],
    }),
    getSupplierStatement: builder.query<SupplierStatementResponse, SupplierStatementQueryArgs>({
      query: ({ supplierId, startDate, endDate }) => ({
        url: `/api/restaurant-finance/suppliers/${supplierId}/statement`,
        params: { startDate, endDate },
      }),
      providesTags: ['RestaurantFinance'],
    }),
    getRestaurantExpenses: builder.query<any, any>({
      query: (params) => ({
        url: '/api/restaurant-finance/expenses',
        params,
      }),
      providesTags: ['RestaurantFinance'],
    }),
    getOverdueInvoices: builder.query<any, void>({
      query: () => '/api/restaurant-finance/overdue',
      providesTags: ['RestaurantFinance'],
    }),
    getRestaurantPayables: builder.query<any, void>({
      query: () => '/api/restaurant-finance/payables',
      providesTags: ['RestaurantFinance'],
    }),

    // Supplier invoices
    getSupplierInvoices: builder.query<any, any>({
      query: (params) => ({ url: '/api/invoices', params }),
      providesTags: ['RestaurantFinance'],
    }),
    getSupplierInvoice: builder.query<any, string>({
      query: (id) => `/api/invoices/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'RestaurantFinance', id }],
    }),
    getSupplierReceivables: builder.query<any, void>({
      query: () => '/api/supplier/invoices/receivables',
      providesTags: ['SupplierOps', 'RestaurantFinance'],
    }),
    getSupplierCommandCenter: builder.query<any, void>({
      query: () => '/api/supplier/command-center',
      providesTags: ['SupplierOps', 'Order', 'Fulfillment', 'RestaurantFinance'],
    }),
    getSupplierReorderIntelligence: builder.query<any, { graceDays?: number } | void>({
      query: (arg) => {
        const params = new URLSearchParams()
        if (arg?.graceDays) params.set('grace_days', String(arg.graceDays))
        const qs = params.toString()
        return `/api/supplier/reorder-intelligence${qs ? `?${qs}` : ''}`
      },
      providesTags: ['SupplierOps'],
    }),
    getSupplierReorderAssistance: builder.query<any, { graceDays?: number } | void>({
      query: (arg) => {
        const params = new URLSearchParams()
        if (arg?.graceDays) params.set('grace_days', String(arg.graceDays))
        const qs = params.toString()
        return `/api/supplier/reorder-assistance${qs ? `?${qs}` : ''}`
      },
      providesTags: ['SupplierOps'],
    }),
    createReorderReminderDraft: builder.mutation<
      {
        draft: {
          id: string
          subject: string
          body: string
          status: string
          autoSent: boolean
          chatUrl?: string | null
          chatPrefill?: string
        }
      },
      { restaurantId: string; openChat?: boolean }
    >({
      query: ({ restaurantId, openChat }) => ({
        url: `/api/supplier/reorder-intelligence/${restaurantId}/reminder-draft`,
        method: 'POST',
        body: openChat ? { openChat: true } : undefined,
      }),
      invalidatesTags: ['SupplierOps'],
    }),
    getSupplierDeliveryBoard: builder.query<
      any,
      { date?: string; status?: string; driverId?: string; area?: string } | void
    >({
      query: (arg) => {
        const params = new URLSearchParams()
        if (arg?.date) params.set('date', arg.date)
        if (arg?.status) params.set('status', arg.status)
        if (arg?.driverId) params.set('driver_id', arg.driverId)
        if (arg?.area) params.set('area', arg.area)
        const qs = params.toString()
        return `/api/supplier/deliveries/board${qs ? `?${qs}` : ''}`
      },
      providesTags: ['Fulfillment', 'SupplierOps'],
    }),
    getProductSubstitutes: builder.query<any, string>({
      query: (productId) => `/api/supplier/products/${productId}/substitutes`,
      providesTags: (_r, _e, id) => [{ type: 'Product', id }],
    }),
    createProductSubstitute: builder.mutation<
      any,
      { productId: string; substituteProductId: string; priority?: number; notes?: string }
    >({
      query: ({ productId, ...body }) => ({
        url: `/api/supplier/products/${productId}/substitutes`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { productId }) => [{ type: 'Product', id: productId }],
    }),
    deleteProductSubstitute: builder.mutation<any, { productId: string; substituteId: string }>({
      query: ({ productId, substituteId }) => ({
        url: `/api/supplier/products/${productId}/substitutes/${substituteId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, { productId }) => [{ type: 'Product', id: productId }],
    }),
    getOrderSubstitutions: builder.query<any, string>({
      query: (orderId) => `/api/supplier/orders/${orderId}/substitutions`,
      providesTags: (_r, _e, id) => [{ type: 'Order', id }],
    }),
    proposeOrderSubstitution: builder.mutation<
      any,
      {
        orderId: string
        orderItemId: string
        substituteProductId: string
        description?: string
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/api/supplier/orders/${orderId}/substitutions/propose`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Order', id: orderId }],
    }),
    getOrderFulfillmentIssues: builder.query<any, string>({
      query: (orderId) => `/api/supplier/orders/${orderId}/fulfillment-issues`,
      providesTags: (_r, _e, id) => [{ type: 'Order', id }],
    }),
    reportOrderShortage: builder.mutation<any, { orderId: string; body: Record<string, unknown> }>({
      query: ({ orderId, body }) => ({
        url: `/api/supplier/orders/${orderId}/fulfillment-issues/shortage`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Order', id: orderId }, 'Chat'],
    }),
    suggestOrderSubstitutionIssue: builder.mutation<
      any,
      { orderId: string; body: Record<string, unknown> }
    >({
      query: ({ orderId, body }) => ({
        url: `/api/supplier/orders/${orderId}/fulfillment-issues/substitution`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Order', id: orderId }, 'Chat'],
    }),
    openOrderFulfillmentChat: builder.mutation<
      any,
      { orderId: string; body: Record<string, unknown> }
    >({
      query: ({ orderId, body }) => ({
        url: `/api/supplier/orders/${orderId}/fulfillment-issues/open-chat`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, { orderId }) => [{ type: 'Order', id: orderId }, 'Chat'],
    }),
    getSupplierAtRiskOrders: builder.query<any, void>({
      query: () => '/api/supplier/reorder-cadence/at-risk',
      providesTags: ['Order'],
    }),
    sendInvoiceReminder: builder.mutation<
      {
        sent: boolean
        skipped?: boolean
        reason?: string
        invoiceId: string
        reminderKind: string
      },
      { invoiceId: string }
    >({
      query: ({ invoiceId }) => ({
        url: `/api/supplier/invoices/${invoiceId}/send-reminder`,
        method: 'POST',
      }),
      invalidatesTags: ['SupplierOps'],
    }),
    remindOverdueInvoices: builder.mutation<
      { sent: number; skipped: number; errors: number; invoiceIds: string[] },
      void
    >({
      query: () => ({
        url: '/api/supplier/invoices/remind-overdue',
        method: 'POST',
      }),
      invalidatesTags: ['SupplierOps'],
    }),
  }),
})

export const { useSendInvoiceReminderMutation, useRemindOverdueInvoicesMutation } = financeApi
