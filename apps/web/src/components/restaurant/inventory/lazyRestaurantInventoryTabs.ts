import { lazy } from 'react'

export const LazyInventoryTab = lazy(() =>
  import('./InventoryTab').then((m) => ({ default: m.InventoryTab }))
)
export const LazyWasteTab = lazy(() => import('./WasteTab').then((m) => ({ default: m.WasteTab })))
export const LazyExpiryTab = lazy(() =>
  import('./ExpiryTab').then((m) => ({ default: m.ExpiryTab }))
)
export const LazyHistoryTab = lazy(() =>
  import('./HistoryTab').then((m) => ({ default: m.HistoryTab }))
)
export const LazyTotalsTab = lazy(() =>
  import('./TotalsTab').then((m) => ({ default: m.TotalsTab }))
)
