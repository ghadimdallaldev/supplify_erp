/**
 * Role-tailored workspace UX: home routes, nav labels, hub modes, and copy.
 * Resolves by system role name first, then permission signals for custom roles.
 */

export type PermissionCheck = (key: string) => boolean

export type CommandCenterMode =
  | 'full'
  | 'sales'
  | 'fulfillment'
  | 'catalog'
  | 'finance'
  | 'readonly'

export type RestaurantDashboardMode = 'full' | 'operations' | 'ordering' | 'finance' | 'readonly'

export type DashboardKpiKey = 'revenue' | 'orders' | 'pending' | 'counterpart'

export type WorkspacePageCopy = {
  cart?: { title: string; description: string }
  orders?: { title: string; description: string }
  receiving?: { title: string; description: string }
  reservations?: { title: string; description: string }
  invoices?: { title: string; description: string }
}

export type WorkspacePersonaId =
  | 'supplier_owner'
  | 'supplier_manager'
  | 'supplier_warehouse'
  | 'supplier_fulfillment'
  | 'supplier_driver'
  | 'supplier_catalog'
  | 'supplier_promotions'
  | 'supplier_accountant'
  | 'supplier_viewer'
  | 'restaurant_owner'
  | 'restaurant_manager'
  | 'restaurant_purchaser'
  | 'restaurant_receiving'
  | 'restaurant_accountant'
  | 'restaurant_foh'
  | 'restaurant_viewer'
  | 'generic'

export type KpiLabelOverride = { label: string; meta: string }

export type NavSectionLike = { label: string; items: Array<{ href: string; name: string }> }

export type WorkspacePersonaProfile = {
  id: WorkspacePersonaId
  /** Landing route after login — matches primary workspace focus. */
  homePath: string
  /** Sidebar item shown first (main daily focus for this role). */
  primaryNavHref: string
  overviewNav: { label: string; href: string; gate: 'promotions' | 'command_center' } | null
  analyticsNav: { label: string; href: string } | null
  showGlobalReports: boolean
  commandCenterMode: CommandCenterMode | null
  dashboard: {
    title: string
    description: string
    kpiKeys: DashboardKpiKey[]
    kpiLabels: Partial<Record<DashboardKpiKey, KpiLabelOverride>>
  } | null
  promotionsCopy: {
    title: string
    subtitle: string
    listTitle: string
    newButton: string
    performanceTitle: string
  }
  readOnly: boolean
  roleLabel: string
  /** Restaurant dashboard section visibility; null for supplier personas and desk-only roles. */
  restaurantDashboardMode?: RestaurantDashboardMode | null
  pageCopy?: WorkspacePageCopy
}

export const SUPPLIER_ANALYTICS_ANY_OF = [
  'FULFILLMENT_VIEW',
  'INVOICES_VIEW',
  'CATALOG_EDIT',
] as const

export const RESTAURANT_DASHBOARD_ANY_OF = ['ORDERS_VIEW', 'INVOICES_VIEW'] as const

export const RESTAURANT_REPORTS_ANY_OF = ['ORDERS_VIEW', 'INVOICES_VIEW'] as const

export const RESTAURANT_DISPUTES_ANY_OF = ['ORDERS_MANAGE', 'RECEIVING_MANAGE'] as const

export const DEFAULT_PROMOTIONS_COPY = {
  title: 'Deals',
  subtitle:
    'Create supplier deals within your plan limits. Boosts are optional paid campaigns for sponsored placement.',
  listTitle: 'Active deals',
  newButton: 'Create deal',
  performanceTitle: 'Deals performance (30 days)',
}

export const GENERIC_PROFILE: WorkspacePersonaProfile = {
  id: 'generic',
  homePath: '/app/dashboard',
  primaryNavHref: '/app/dashboard',
  overviewNav: { label: 'Dashboard', href: '/app/dashboard', gate: 'command_center' },
  analyticsNav: { label: 'Dashboard', href: '/app/dashboard' },
  showGlobalReports: true,
  commandCenterMode: 'full',
  dashboard: {
    title: 'Dashboard',
    description: 'Workspace activity at a glance.',
    kpiKeys: ['revenue', 'orders', 'pending', 'counterpart'],
    kpiLabels: {},
  },
  promotionsCopy: DEFAULT_PROMOTIONS_COPY,
  readOnly: false,
  roleLabel: 'Team member',
}

/** Puts the role's primary nav link at the top of the sidebar (first thing visible). */
export function reorderNavSectionsForPrimaryFocus<T extends { href: string }>(
  sections: Array<{ label?: string; labelKey?: string; items: T[] }>,
  primaryHref: string
): Array<{ label?: string; labelKey?: string; items: T[] }> {
  let primary: T | null = null
  const rest = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.href === primaryHref) {
          primary = item
          return false
        }
        return true
      }),
    }))
    .filter((section) => section.items.length > 0)

  if (!primary) return sections

  const overviewIdx = rest.findIndex(
    (s) => s.label === 'OVERVIEW' || s.labelKey === 'section.overview'
  )
  if (overviewIdx >= 0) {
    const overview = rest[overviewIdx]
    rest[overviewIdx] = {
      ...overview,
      items: [primary, ...overview.items],
    }
    return rest
  }

  return [{ labelKey: 'section.overview', items: [primary] }, ...rest]
}
