/**
 * Shared admin dashboard utilities only.
 * Tab components must be imported via lazyAdminDashboardTabs.ts so Vite can split chunks.
 */
export {
  AdminTabLoading,
  dedupeAdminPlans,
  ADMIN_TENANT_PAGE_SIZE,
  type AdminTabKey,
  type AdminCanTabMap,
} from './adminDashboardShared'

export {
  useAdminChangePlanDialog,
  type AdminChangePlanTarget,
  type OpenChangePlanFn,
} from './AdminChangePlanDialog'

export { AdminTabMount } from './AdminTabMount'
