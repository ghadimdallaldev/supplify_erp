import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  BarChart3,
  Building2,
  CreditCard,
  DollarSign,
  Flag,
  Gauge,
  HeartPulse,
  LayoutDashboard,
  List,
  Repeat,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react'
import type { AdminTabKey } from '../dashboard/adminDashboardShared'

export type AdminPortal = 'platform' | 'suppliers' | 'restaurants'

export type AdminNavItem = {
  tab: AdminTabKey
  labelKey: string
  icon: LucideIcon
}

export type AdminNavGroup = {
  labelKey: string
  items: AdminNavItem[]
}

export type AdminNavGroupResolved = {
  label: string
  items: Array<{ tab: AdminTabKey; label: string; icon: LucideIcon }>
}

const ADMIN_TAB_KEYS: AdminTabKey[] = [
  'overview',
  'activity',
  'tenants',
  'users',
  'subscriptions',
  'plans',
  'finance',
  'usage',
  'features',
  'deals',
  'limits',
  'health',
  'operations',
  'audit',
]

export function isAdminTabKey(value: string | null | undefined): value is AdminTabKey {
  if (!value) return false
  return ADMIN_TAB_KEYS.includes(value as AdminTabKey)
}

export function defaultTabForPortal(portal: AdminPortal): AdminTabKey {
  if (portal === 'suppliers' || portal === 'restaurants') return 'tenants'
  return 'overview'
}

export function adminPortalBasePath(portal: AdminPortal): string {
  if (portal === 'suppliers') return '/app/admin/suppliers'
  if (portal === 'restaurants') return '/app/admin/restaurants'
  return '/app/admin'
}

export function adminTabPath(portal: AdminPortal, tab: AdminTabKey): string {
  const base = adminPortalBasePath(portal)
  if (tab === defaultTabForPortal(portal)) return base
  return `${base}/${tab}`
}

export function resolveAdminTabFromPath(pathname: string, portal: AdminPortal): AdminTabKey | null {
  const base = adminPortalBasePath(portal)
  if (pathname === base) return null
  const prefix = `${base}/`
  if (!pathname.startsWith(prefix)) return null
  const segment = pathname.slice(prefix.length).split('/')[0]
  return isAdminTabKey(segment) ? segment : null
}

export function isValidTabForPortal(tab: AdminTabKey, portal: AdminPortal): boolean {
  if (portal === 'platform') return true
  return ['tenants', 'usage', 'audit'].includes(tab)
}

export const ADMIN_PORTAL_LINKS = [
  {
    id: 'platform' as const,
    href: '/app/admin',
    icon: Shield,
    match: (path: string) => {
      if (path === '/app/admin') return true
      if (path.startsWith('/app/admin/suppliers') || path.startsWith('/app/admin/restaurants')) {
        return false
      }
      return path.startsWith('/app/admin/')
    },
  },
  {
    id: 'suppliers' as const,
    href: '/app/admin/suppliers',
    icon: Building2,
    match: (path: string) => path.startsWith('/app/admin/suppliers'),
  },
  {
    id: 'restaurants' as const,
    href: '/app/admin/restaurants',
    icon: Users,
    match: (path: string) => path.startsWith('/app/admin/restaurants'),
  },
  {
    id: 'settings' as const,
    href: '/app/settings',
    icon: Settings,
    match: (path: string) => path.startsWith('/app/settings'),
  },
] as const

export const ADMIN_PLATFORM_NAV: AdminNavGroup[] = [
  {
    labelKey: 'monitor',
    items: [
      { tab: 'overview', labelKey: 'overview', icon: LayoutDashboard },
      { tab: 'activity', labelKey: 'activity', icon: Activity },
      { tab: 'health', labelKey: 'health', icon: HeartPulse },
      { tab: 'operations', labelKey: 'operations', icon: Wrench },
      { tab: 'audit', labelKey: 'audit', icon: Shield },
    ],
  },
  {
    labelKey: 'accounts',
    items: [
      { tab: 'tenants', labelKey: 'tenants', icon: Building2 },
      { tab: 'users', labelKey: 'users', icon: Users },
    ],
  },
  {
    labelKey: 'billing',
    items: [
      { tab: 'plans', labelKey: 'plans', icon: CreditCard },
      { tab: 'subscriptions', labelKey: 'subscriptions', icon: Repeat },
      { tab: 'finance', labelKey: 'finance', icon: DollarSign },
      { tab: 'usage', labelKey: 'usage', icon: BarChart3 },
      { tab: 'limits', labelKey: 'limits', icon: Gauge },
    ],
  },
  {
    labelKey: 'growth',
    items: [
      { tab: 'features', labelKey: 'features', icon: Flag },
      { tab: 'deals', labelKey: 'deals', icon: Sparkles },
    ],
  },
]

export const ADMIN_TENANT_PORTAL_NAV: AdminNavGroup[] = [
  {
    labelKey: 'manage',
    items: [
      { tab: 'tenants', labelKey: 'directory', icon: List },
      { tab: 'usage', labelKey: 'usage', icon: BarChart3 },
      { tab: 'audit', labelKey: 'audit', icon: Shield },
    ],
  },
]

/** @deprecated Use useAdminTabLabels() for translated labels */
export const ADMIN_TAB_LABELS: Record<AdminTabKey, string> = {
  overview: 'Overview',
  activity: 'Activity',
  tenants: 'Tenants',
  users: 'Users',
  subscriptions: 'Subscriptions',
  plans: 'Plans',
  finance: 'Finance',
  usage: 'Usage',
  features: 'Features',
  deals: 'Deals & boosts',
  limits: 'Limits',
  health: 'Health',
  operations: 'Operations',
  audit: 'Audit log',
}

export function resolveAdminPortal(pathname: string): AdminPortal {
  if (pathname.startsWith('/app/admin/suppliers')) return 'suppliers'
  if (pathname.startsWith('/app/admin/restaurants')) return 'restaurants'
  return 'platform'
}
