import { lazy } from 'react'

export const LazyInvoiceDetailDialog = lazy(() =>
  import('./InvoiceDetailDialog').then((m) => ({ default: m.InvoiceDetailDialog }))
)
export const LazyInvoicePaymentDialog = lazy(() =>
  import('./InvoicePaymentDialog').then((m) => ({ default: m.InvoicePaymentDialog }))
)
