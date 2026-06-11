import { lazy } from 'react'

/**
 * Per-tab dynamic imports keep the staff page shell small.
 * Each chunk loads only when its tab is first opened.
 */
export const LazyStaffTodayTab = lazy(() =>
  import('./tabs/StaffTodayTab').then((m) => ({ default: m.StaffTodayTab }))
)
export const LazyStaffTeamTab = lazy(() =>
  import('./tabs/StaffTeamTab').then((m) => ({ default: m.StaffTeamTab }))
)
export const LazyStaffScheduleTab = lazy(() =>
  import('./tabs/StaffScheduleTab').then((m) => ({ default: m.StaffScheduleTab }))
)
export const LazyStaffPtoTab = lazy(() =>
  import('./tabs/StaffPtoTab').then((m) => ({ default: m.StaffPtoTab }))
)
export const LazyStaffAnnouncementsTab = lazy(() =>
  import('./tabs/StaffAnnouncementsTab').then((m) => ({ default: m.StaffAnnouncementsTab }))
)
export const LazyStaffDocumentsTab = lazy(() =>
  import('./tabs/StaffDocumentsTab').then((m) => ({ default: m.StaffDocumentsTab }))
)
export const LazyStaffReportsTab = lazy(() =>
  import('./tabs/StaffReportsTab').then((m) => ({ default: m.StaffReportsTab }))
)
