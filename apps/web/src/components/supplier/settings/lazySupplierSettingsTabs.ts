import { lazy } from 'react'

/**
 * Per-tab dynamic imports keep the supplier settings shell small.
 * Each chunk loads only when its tab is first opened.
 */
export const LazySupplierProfileTab = lazy(() =>
  import('./tabs/SupplierProfileTab').then((m) => ({ default: m.SupplierProfileTab }))
)
export const LazySupplierBusinessTab = lazy(() =>
  import('./tabs/SupplierBusinessTab').then((m) => ({ default: m.SupplierBusinessTab }))
)
export const LazySupplierWarehousesTab = lazy(() =>
  import('./tabs/SupplierWarehousesTab').then((m) => ({ default: m.SupplierWarehousesTab }))
)
export const LazySupplierPlanTab = lazy(() =>
  import('./tabs/SupplierPlanTab').then((m) => ({ default: m.SupplierPlanTab }))
)
export const LazySupplierBranchesTab = lazy(() =>
  import('./tabs/SupplierBranchesTab').then((m) => ({ default: m.SupplierBranchesTab }))
)
export const LazySupplierTeamTab = lazy(() =>
  import('./tabs/SupplierTeamTab').then((m) => ({ default: m.SupplierTeamTab }))
)
export const LazySupplierNotificationsTab = lazy(() =>
  import('./tabs/SupplierNotificationsTab').then((m) => ({
    default: m.SupplierNotificationsTab,
  }))
)
export const LazySupplierDriversTab = lazy(() =>
  import('./tabs/SupplierDriversTab').then((m) => ({ default: m.SupplierDriversTab }))
)
export const LazySupplierActivityTab = lazy(() =>
  import('./tabs/SupplierActivityTab').then((m) => ({ default: m.SupplierActivityTab }))
)
