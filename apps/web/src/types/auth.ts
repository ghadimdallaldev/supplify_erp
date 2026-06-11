// User types
import type { Supplier } from './suppliers'
import type { Restaurant } from './restaurants'

export type LegalAcceptanceStatus = {
  needsReacceptance: boolean
  currentPackVersion: string
  acceptedPackVersion: string | null
  requiredDocuments: string[]
  missingDocuments: string[]
  variant: 'registration' | 'invite'
  accountType: 'RESTAURANT' | 'SUPPLIER' | null
}

export interface User {
  id: string
  email: string
  displayName: string
  role: 'ADMIN' | 'SUPPLIER' | 'RESTAURANT' | 'PENDING' | 'STAFF_PORTAL'
  /** platform = main app; staff_portal = operational staff only */
  accessType?: 'platform' | 'staff_portal'
  staffPortal?: {
    staffId: string
    restaurantId: string
    displayName?: string | null
  } | null
  createdAt: string
  /** Tenant-scoped role codes (e.g. RESTAURANT_OWNER, SUPPLIER_STAFF) */
  tenantRoles?: string[]
  /** Tenant-scoped permission codes for RBAC nav gating */
  tenantPermissions?: string[]
  /** Active workspace (supplier/restaurant account + role label) */
  workspace?: {
    tenantId: string
    tenantType: 'SUPPLIER' | 'RESTAURANT'
    tenantName: string
    roleName: string | null
  }
  /** Admin role codes when user.role === 'ADMIN' */
  adminRoles?: string[]
  /** Admin permission codes for admin nav gating */
  adminPermissions?: string[]
  /** Current legal pack acceptance status (login re-acceptance gate) */
  legalStatus?: LegalAcceptanceStatus
  /** Platform admin UI preferences */
  adminPreferences?: AdminUserPreferences
}

export type AdminLandingTab =
  | 'overview'
  | 'activity'
  | 'tenants'
  | 'users'
  | 'subscriptions'
  | 'plans'
  | 'finance'
  | 'usage'
  | 'features'
  | 'deals'
  | 'limits'
  | 'operations'
  | 'health'
  | 'audit'

export type AdminThemePreference = 'light' | 'dark' | 'system'

export interface AdminUserPreferences {
  defaultLandingTab: AdminLandingTab
  compactMode: boolean
  themePreference: AdminThemePreference
}

export interface UserWithDetails extends User {
  supplier?: Supplier
  restaurant?: Restaurant
}
