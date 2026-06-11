import { lazy } from 'react'

export const LazyOrderTimelineTab = lazy(() =>
  import('./OrderTimelineTab').then((m) => ({ default: m.OrderTimelineTab }))
)
export const LazyOrderDetailsTab = lazy(() =>
  import('./OrderDetailsTab').then((m) => ({ default: m.OrderDetailsTab }))
)
export const LazyOrderItemsTab = lazy(() =>
  import('./OrderItemsTab').then((m) => ({ default: m.OrderItemsTab }))
)
export const LazyOrderInvoiceTab = lazy(() =>
  import('./OrderInvoiceTab').then((m) => ({ default: m.OrderInvoiceTab }))
)
export const LazyOrderPickingTab = lazy(() =>
  import('./OrderPickingTab').then((m) => ({ default: m.OrderPickingTab }))
)
export const LazyOrderDeliveryTab = lazy(() =>
  import('./OrderDeliveryTab').then((m) => ({ default: m.OrderDeliveryTab }))
)
export const LazyOrderPackingTab = lazy(() =>
  import('./OrderPackingTab').then((m) => ({ default: m.OrderPackingTab }))
)
