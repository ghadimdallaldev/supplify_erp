import { lazy } from 'react'

/**
 * Per-tab dynamic imports keep the admin dashboard shell small.
 * Each chunk loads only when its tab is first opened.
 */
export const LazyAdminOverviewTab = lazy(() =>
  import('./AdminOverviewTab').then((m) => ({ default: m.AdminOverviewTab }))
)
export const LazyAdminPlansTab = lazy(() =>
  import('./AdminPlansTab').then((m) => ({ default: m.AdminPlansTab }))
)
export const LazyAdminSubscriptionsTab = lazy(() =>
  import('./AdminSubscriptionsTab').then((m) => ({ default: m.AdminSubscriptionsTab }))
)
export const LazyAdminFinanceTab = lazy(() =>
  import('./AdminFinanceTab').then((m) => ({ default: m.AdminFinanceTab }))
)
export const LazyAdminHealthTab = lazy(() =>
  import('./AdminHealthTab').then((m) => ({ default: m.AdminHealthTab }))
)
export const LazyAdminTenantsTab = lazy(() =>
  import('./AdminTenantsTab').then((m) => ({ default: m.AdminTenantsTab }))
)
export const LazyAdminUsageTab = lazy(() =>
  import('./AdminUsageTab').then((m) => ({ default: m.AdminUsageTab }))
)
export const LazyAdminActivityTab = lazy(() =>
  import('./AdminActivityTab').then((m) => ({ default: m.AdminActivityTab }))
)
export const LazyAdminAuditTab = lazy(() =>
  import('./AdminAuditTab').then((m) => ({ default: m.AdminAuditTab }))
)
export const LazyAdminFeaturesTab = lazy(() =>
  import('./AdminFeaturesTab').then((m) => ({ default: m.AdminFeaturesTab }))
)
