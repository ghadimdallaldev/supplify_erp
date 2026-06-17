import { api } from '../base'

export type SupplierRunSheetKpis = {
  ordersToPrepareToday: number
  deliveriesPendingToday: number
  ordersWaitingAction: number
  unpaidBalance: number
  overdueBalance: number
  customersDueReorder: number
  lowStockCount: number
  openDisputes: number
  fulfillmentAlerts: number
}

export type SupplierRunSheetPriority = {
  id: string
  type: string
  title: string
  href?: string
  severity?: string
}

export type SupplierRunSheetOrderToPick = {
  orderId: string
  orderStatus: string
  restaurantName: string
  scheduledAt: string
  pickListId: string | null
  pickListStatus: string | null
}

export type SupplierRunSheetReceivableInvoice = {
  id: string
  invoiceNumber?: string
  restaurantId?: string
  restaurantName?: string
  status?: string
  invoiceDate?: string
  dueDate: string
  totalAmount?: number
  paidAmount?: number
  balanceDue: number
  isOverdue: boolean
  daysOverdue?: number
  agingBucket?: string
}

export type SupplierRunSheetReorderLead = {
  restaurantId: string
  restaurantName: string
  orderCount?: number
  lastOrderAt?: string
  avgDaysBetween?: number
  daysSinceLastOrder?: number
  graceDays?: number
  suggestedFollowUp?: string
  suggestedProducts?: unknown[]
  riskLevel?: string
}

export type SupplierRunSheetShortagePreview = {
  id: string
  orderId: string
  issueType: string
  status: string
  createdAt: string
  restaurantName: string
  productName: string
}

export type SupplierRunSheetResponse = {
  date: string
  summary: {
    kpis: SupplierRunSheetKpis
    todaysPriorities: SupplierRunSheetPriority[]
  }
  ordersToPick: {
    count: number
    orders: SupplierRunSheetOrderToPick[]
  }
  deliveries: {
    filters: Record<string, unknown>
    orders: unknown[]
    byArea?: Record<string, unknown[]>
    routeSummary?: unknown[]
    stats: Record<string, number>
  }
  receivablesDueToday: {
    summary: {
      count: number
      totalBalanceDue: number
      dueTodayCount: number
      overdueCount: number
    }
    invoices: SupplierRunSheetReceivableInvoice[]
  }
  reorderLeads: SupplierRunSheetReorderLead[]
  shortages: {
    count: number
    preview: SupplierRunSheetShortagePreview[]
  }
}

export const runSheetApi = api.injectEndpoints({
  endpoints: (builder) => ({
    getSupplierRunSheet: builder.query<SupplierRunSheetResponse, { date?: string } | void>({
      query: (arg) => {
        const params = new URLSearchParams()
        if (arg?.date) params.set('date', arg.date)
        const qs = params.toString()
        return `/api/supplier/run-sheet${qs ? `?${qs}` : ''}`
      },
      providesTags: ['SupplierOps', 'Order', 'Fulfillment', 'RestaurantFinance'],
    }),
  }),
})

export const { useGetSupplierRunSheetQuery } = runSheetApi
