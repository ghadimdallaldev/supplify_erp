import { lazy } from 'react'

export const LazyDashboardWidgetGrid = lazy(() =>
  import('./DashboardWidgetGrid').then((m) => ({ default: m.DashboardWidgetGrid }))
)
