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
  restaurantName?: string
  dueDate: string
  balanceDue: number
  isOverdue: boolean
  daysOverdue?: number
}

export type SupplierRunSheetRouteSummary = {
  area: string
  orderCount: number
  pending?: number
  outForDelivery?: number
  delivered?: number
}

export type SupplierRunSheetResponse = {
  date: string
  summary: {
    kpis: SupplierRunSheetKpis
    todaysPriorities: { id: string; type: string; title: string; severity?: string }[]
  }
  ordersToPick: { count: number; orders: SupplierRunSheetOrderToPick[] }
  deliveries: {
    orders: unknown[]
    routeSummary?: SupplierRunSheetRouteSummary[]
    stats: Record<string, number>
  }
  receivablesDueToday: {
    summary: { count: number; totalBalanceDue: number; overdueCount: number }
    invoices: SupplierRunSheetReceivableInvoice[]
  }
  shortages: { count: number; preview: { id: string; orderId: string; restaurantName: string; productName: string }[] }
}
