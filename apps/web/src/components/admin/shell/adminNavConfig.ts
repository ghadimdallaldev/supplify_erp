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
  label: string
  icon: LucideIcon
}

export type AdminNavGroup = {
  label: string
  items: AdminNavItem[]
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
    label: 'Platform',
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
    label: 'Suppliers',
    icon: Building2,
    match: (path: string) => path.startsWith('/app/admin/suppliers'),
  },
  {
    id: 'restaurants' as const,
    href: '/app/admin/restaurants',
    label: 'Restaurants',
    icon: Users,
    match: (path: string) => path.startsWith('/app/admin/restaurants'),
  },
  {
    id: 'settings' as const,
    href: '/app/settings',
    label: 'Settings',
    icon: Settings,
    match: (path: string) => path.startsWith('/app/settings'),
  },
] as const

export const ADMIN_PLATFORM_NAV: AdminNavGroup[] = [
  {
    label: 'Monitor',
    items: [
      { tab: 'overview', label: 'Overview', icon: LayoutDashboard },
      { tab: 'activity', label: 'Activity', icon: Activity },
      { tab: 'health', label: 'Health', icon: HeartPulse },
      { tab: 'operations', label: 'Operations', icon: Wrench },
      { tab: 'audit', label: 'Audit log', icon: Shield },
    ],
  },
  {
    label: 'Accounts',
    items: [
      { tab: 'tenants', label: 'All tenants', icon: Building2 },
      { tab: 'users', label: 'Users', icon: Users },
    ],
  },
  {
    label: 'Billing',
    items: [
      { tab: 'plans', label: 'Plans', icon: CreditCard },
      { tab: 'subscriptions', label: 'Subscriptions', icon: Repeat },
      { tab: 'finance', label: 'Finance', icon: DollarSign },
      { tab: 'usage', label: 'Usage', icon: BarChart3 },
      { tab: 'limits', label: 'Limits', icon: Gauge },
    ],
  },
  {
    label: 'Growth',
    items: [
      { tab: 'features', label: 'Features', icon: Flag },
      { tab: 'deals', label: 'Deals & boosts', icon: Sparkles },
    ],
  },
]

export const ADMIN_TENANT_PORTAL_NAV: AdminNavGroup[] = [
  {
    label: 'Manage',
    items: [
      { tab: 'tenants', label: 'Directory', icon: List },
      { tab: 'usage', label: 'Usage & quotas', icon: BarChart3 },
      { tab: 'audit', label: 'Audit log', icon: Shield },
    ],
  },
]

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
