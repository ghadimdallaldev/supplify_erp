import { lazy } from 'react'

export const LazyQuickListCreateDialog = lazy(() =>
  import('./QuickListCreateDialog').then((m) => ({ default: m.QuickListCreateDialog }))
)
export const LazyQuickListProductDialog = lazy(() =>
  import('./QuickListProductDialog').then((m) => ({ default: m.QuickListProductDialog }))
)
export const LazyQuickListScheduleDialog = lazy(() =>
  import('./QuickListScheduleDialog').then((m) => ({ default: m.QuickListScheduleDialog }))
)
export const LazyQuickListDetailsDialog = lazy(() =>
  import('./QuickListDetailsDialog').then((m) => ({ default: m.QuickListDetailsDialog }))
)
