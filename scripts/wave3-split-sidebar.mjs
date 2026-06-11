import fs from 'fs'

const lines = fs
  .readFileSync('apps/web/src/components/Sidebar.tsx', 'utf8')
  .replace(/\r\n/g, '\n')
  .split('\n')
const navBlock = lines.slice(157, 560).join('\n')

const header = `import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  Building2,
  Settings,
  MessageSquare,
  ShoppingBag,
  Truck,
  FileText,
  List,
  Package2,
  PackageCheck,
  Shield,
  CalendarDays,
  UserCircle2,
  BarChart3,
  Scale,
  Tag,
  Percent,
  Radar,
  FileQuestion,
} from 'lucide-react'
import type { WorkspacePersonaProfile } from '../../lib/workspaceRoleProfile'
import {
  reorderNavSectionsForPrimaryFocus,
  restaurantAnalyticsNavAllowed,
  restaurantOverviewNavAllowed,
  restaurantReportsNavAllowed,
  RESTAURANT_DISPUTES_ANY_OF,
  RESTAURANT_REPORTS_ANY_OF,
  supplierAnalyticsNavAllowed,
  supplierOverviewNavAllowed,
  SUPPLIER_ANALYTICS_ANY_OF,
} from '../../lib/workspaceRoleProfile'

export type SidebarNavItem = {
  name: string
  href: string
  icon: any
  permission?: string
  anyOf?: string[]
  badge?: 'pending' | 'unread' | 'disputes'
  testId?: string
}

export type SidebarNavSectionConfig = { label: string; items: SidebarNavItem[] }

export function navItemAllowed(
  item: SidebarNavItem,
  can: (key: string) => boolean,
  canAny: (...keys: string[]) => boolean
) {
  if (item.anyOf?.length) return canAny(...item.anyOf)
  if (item.permission) return can(item.permission)
  return true
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === '/app/command-center') {
    return pathname === href || pathname === '/app' || pathname === '/' || pathname === '/app/'
  }
  if (href === '/app/dashboard') {
    return pathname === href || pathname.startsWith(\`\${href}/\`)
  }
  return pathname === href || pathname.startsWith(\`\${href}/\`)
}

export type BuildSidebarSectionsInput = {
  can: (key: string) => boolean
  canAny: (...keys: string[]) => boolean
  persona: WorkspacePersonaProfile
  isRestaurant: boolean
  isSupplier: boolean
  impersonatingRestaurant: boolean
  impersonatingSupplier: boolean
  hasAdminNavAccess: boolean
  isImpersonating: boolean
  isDriverRole: boolean
  reportsEnabled: boolean
  supplierDealsEnabled: boolean
  financeInvoicesEnabled: boolean
  fulfillmentEnabled: boolean
  quickListsEnabled: boolean
  disputesEnabled: boolean
  promotionsEnabled: boolean
}

export function buildSidebarSections(input: BuildSidebarSectionsInput): SidebarNavSectionConfig[] {
  const {
    can,
    canAny,
    persona,
    isRestaurant,
    isSupplier,
    impersonatingRestaurant,
    impersonatingSupplier,
    hasAdminNavAccess,
    isImpersonating,
    isDriverRole,
    reportsEnabled,
    supplierDealsEnabled,
    financeInvoicesEnabled,
    fulfillmentEnabled,
    quickListsEnabled,
    disputesEnabled,
    promotionsEnabled,
  } = input

  let sections: SidebarNavSectionConfig[] = []
`

const footer = `
  sections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => navItemAllowed(item, can, canAny)),
    }))
    .filter((section) => section.items.length > 0)

  return reorderNavSectionsForPrimaryFocus(sections, persona.primaryNavHref)
}
`

const body = navBlock
  .replace(/let sections: NavSection\[\] = \[\]\n\n/, '')
  .replace(/\bNavItem\b/g, 'SidebarNavItem')
  .replace(/\bNavSection\b/g, 'SidebarNavSectionConfig')

fs.mkdirSync('apps/web/src/components/sidebar', { recursive: true })
fs.writeFileSync(
  'apps/web/src/components/sidebar/sidebarNavConfig.ts',
  header + body + footer
)
console.log('wrote sidebarNavConfig.ts')
