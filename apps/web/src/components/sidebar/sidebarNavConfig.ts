import {
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
    return pathname === href || pathname.startsWith(`${href}/`)
  }
  return pathname === href || pathname.startsWith(`${href}/`)
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
  if (isRestaurant || impersonatingRestaurant) {
    const ops: SidebarNavItem[] = [
      {
        name: 'Orders',
        href: '/app/orders',
        icon: ShoppingCart,
        badge: 'pending' as const,
        permission: 'ORDERS_VIEW',
        testId: 'nav-orders',
      },
      {
        name: 'Products',
        href: '/app/products',
        icon: Package,
        permission: 'CATALOG_VIEW',
        testId: 'nav-products',
      },
      {
        name: 'My Prices',
        href: '/app/my-prices',
        icon: Percent,
        permission: 'CATALOG_VIEW',
        testId: 'nav-my-prices',
      },
      ...(quickListsEnabled
        ? [
            {
              name: 'Ordering Lists',
              href: '/app/quick-lists',
              icon: List,
              permission: 'ORDERS_VIEW',
              testId: 'nav-quick-lists',
            },
          ]
        : []),
      {
        name: 'Cart',
        href: '/app/cart',
        icon: ShoppingBag,
        permission: 'ORDERS_CREATE',
        testId: 'nav-cart',
      },
      {
        name: 'Quote requests',
        href: '/app/quote-requests',
        icon: FileQuestion,
        permission: 'ORDERS_CREATE',
        testId: 'nav-quote-requests',
      },
      {
        name: 'Reservations',
        href: '/app/reservations',
        icon: CalendarDays,
        permission: 'RESERVATIONS_VIEW',
        testId: 'nav-reservations',
      },
      {
        name: 'Receiving',
        href: '/app/receiving',
        icon: PackageCheck,
        permission: 'RECEIVING_VIEW',
        testId: 'nav-receiving',
      },
    ].filter((item) => navItemAllowed(item, can, canAny))

    const intel: SidebarNavItem[] = [
      {
        name: 'Suppliers',
        href: '/app/suppliers',
        icon: Building2,
        permission: 'CATALOG_VIEW',
        testId: 'nav-suppliers',
      },
      ...(reportsEnabled && restaurantReportsNavAllowed(persona, can)
        ? [
            {
              name: 'Reports',
              href: '/app/reports',
              icon: BarChart3,
              anyOf: [...RESTAURANT_REPORTS_ANY_OF],
              testId: 'nav-reports',
            },
          ]
        : []),
      ...(disputesEnabled
        ? [
            {
              name: 'Disputes',
              href: '/app/disputes',
              icon: Scale,
              anyOf: [...RESTAURANT_DISPUTES_ANY_OF],
              badge: 'disputes' as const,
              testId: 'nav-disputes',
            },
          ]
        : []),
      ...(supplierDealsEnabled
        ? [
            {
              name: 'Deals',
              href: '/app/deals',
              icon: Percent,
              permission: 'PROMOTIONS_VIEW',
              testId: 'nav-deals',
            },
          ]
        : []),
      ...(financeInvoicesEnabled
        ? [
            {
              name: 'Invoices',
              href: '/app/invoices',
              icon: FileText,
              permission: 'INVOICES_VIEW',
              testId: 'nav-invoices',
            },
          ]
        : []),
      {
        name: 'Chat',
        href: '/app/chat',
        icon: MessageSquare,
        permission: 'CHAT_VIEW',
        testId: 'nav-chat',
      },
    ].filter((item) => navItemAllowed(item, can, canAny))

    const acct: SidebarNavItem[] = [
      {
        name: 'Staff',
        href: '/app/staff',
        icon: UserCircle2,
        permission: 'STAFF_VIEW',
        testId: 'nav-staff',
      },
      {
        name: 'Inventory',
        href: '/app/restaurant-inventory',
        icon: Package2,
        permission: 'INVENTORY_VIEW',
        testId: 'nav-inventory',
      },
      {
        name: 'Settings',
        href: '/app/settings',
        icon: Settings,
        permission: 'SETTINGS_VIEW',
        testId: 'nav-settings',
      },
    ].filter((item) => navItemAllowed(item, can, canAny))

    const overviewItems: SidebarNavItem[] = []
    if (persona.analyticsNav && restaurantAnalyticsNavAllowed(persona, can)) {
      overviewItems.push({
        name: persona.analyticsNav.label,
        href: persona.analyticsNav.href,
        icon: LayoutDashboard,
        anyOf: ['ORDERS_VIEW', 'INVOICES_VIEW'],
        testId: 'nav-dashboard',
      })
    }
    if (restaurantOverviewNavAllowed(persona, can)) {
      overviewItems.push({
        name: persona.overviewNav!.label,
        href: persona.overviewNav!.href,
        icon: persona.id === 'restaurant_foh' ? CalendarDays : PackageCheck,
        anyOf: ['RESERVATIONS_VIEW', 'RECEIVING_VIEW'],
        testId: 'nav-role-home',
      })
    }

    sections = [
      ...(overviewItems.length
        ? [
            {
              label: 'OVERVIEW',
              items: overviewItems.filter((item) => navItemAllowed(item, can, canAny)),
            },
          ]
        : []),
      { label: 'OPERATIONS', items: ops },
      ...(intel.length ? [{ label: 'INTELLIGENCE', items: intel }] : []),
      ...(acct.length ? [{ label: 'ACCOUNT', items: acct }] : []),
    ]
  } else if (hasAdminNavAccess && !isImpersonating) {
    sections = [
      {
        label: 'ADMIN',
        items: [
          {
            name: 'Admin Dashboard',
            href: '/app/admin',
            icon: Shield,
            testId: 'nav-admin-dashboard',
          },
          {
            name: 'Supplier Admin',
            href: '/app/admin/suppliers',
            icon: Building2,
            testId: 'nav-supplier-admin',
          },
          {
            name: 'Restaurant Admin',
            href: '/app/admin/restaurants',
            icon: Users,
            testId: 'nav-restaurant-admin',
          },
        ],
      },
      {
        label: 'ACCOUNT',
        items: [
          { name: 'Settings', href: '/app/settings', icon: Settings, testId: 'nav-settings' },
        ],
      },
    ]
  } else if (isSupplier || impersonatingSupplier) {
    if (isDriverRole) {
      sections = [
        {
          label: 'DELIVERIES',
          items: [
            {
              name: 'My Deliveries',
              href: '/app/driver-deliveries',
              icon: Truck,
              permission: 'DRIVER_DELIVERIES_VIEW',
              testId: 'nav-driver-deliveries',
            },
          ].filter((item) => navItemAllowed(item, can, canAny)),
        },
      ]
    } else {
      const ops: SidebarNavItem[] = [
        {
          name: 'Orders',
          href: '/app/orders',
          icon: ShoppingCart,
          badge: 'pending' as const,
          permission: 'ORDERS_VIEW',
          testId: 'nav-orders',
        },
        {
          name: 'Products',
          href: '/app/products',
          icon: Package,
          permission: 'CATALOG_VIEW',
          testId: 'nav-products',
        },
        {
          name: 'Contract Pricing',
          href: '/app/contract-pricing',
          icon: Percent,
          permission: 'CATALOG_VIEW',
          testId: 'nav-contract-pricing',
        },
        ...(fulfillmentEnabled
          ? [
              {
                name: 'Fulfillment',
                href: '/app/fulfillment',
                icon: Truck,
                permission: 'FULFILLMENT_VIEW',
                testId: 'nav-fulfillment',
              },
            ]
          : []),
        {
          name: 'Restaurants',
          href: '/app/restaurants',
          icon: Users,
          permission: 'ORDERS_VIEW',
          testId: 'nav-restaurants',
        },
        {
          name: 'Quote inbox',
          href: '/app/quote-requests/supplier',
          icon: FileQuestion,
          permission: 'ORDERS_VIEW',
          testId: 'nav-supplier-quote-inbox',
        },
        ...(disputesEnabled
          ? [
              {
                name: 'Disputes',
                href: '/app/disputes',
                icon: Scale,
                permission: 'FULFILLMENT_VIEW',
                badge: 'disputes' as const,
                testId: 'nav-disputes',
              },
            ]
          : []),
      ].filter((item) => navItemAllowed(item, can, canAny))
      const intel: SidebarNavItem[] = [
        ...(reportsEnabled && persona.showGlobalReports
          ? [
              {
                name: 'Reports',
                href: '/app/reports',
                icon: BarChart3,
                anyOf: [...SUPPLIER_ANALYTICS_ANY_OF],
                testId: 'nav-reports',
              },
            ]
          : []),
        ...(promotionsEnabled
          ? [
              {
                name: 'Deals',
                href: '/app/promotions',
                icon: Tag,
                permission: 'PROMOTIONS_VIEW',
                testId: 'nav-promotions',
              },
            ]
          : []),
        ...(financeInvoicesEnabled
          ? [
              {
                name: 'Invoices',
                href: '/app/invoices',
                icon: FileText,
                permission: 'INVOICES_VIEW',
                testId: 'nav-invoices',
              },
            ]
          : []),
        {
          name: 'Chat',
          href: '/app/chat',
          icon: MessageSquare,
          permission: 'CHAT_VIEW',
          testId: 'nav-chat',
        },
      ].filter((item) => navItemAllowed(item, can, canAny))

      const supplierOverview: SidebarNavItem[] = []
      if (persona.overviewNav && supplierOverviewNavAllowed(persona, can, canAny)) {
        supplierOverview.push({
          name: persona.overviewNav.label,
          href: persona.overviewNav.href,
          icon: Radar,
          anyOf:
            persona.overviewNav.gate === 'promotions'
              ? ['PROMOTIONS_VIEW']
              : [
                  'ORDERS_MANAGE',
                  'INVOICES_VIEW',
                  'CATALOG_EDIT',
                  'FULFILLMENT_VIEW',
                  'PROMOTIONS_MANAGE',
                  'PROMOTIONS_VIEW',
                ],
          testId: 'nav-command-center',
        })
      }
      if (persona.analyticsNav && supplierAnalyticsNavAllowed(persona, can)) {
        supplierOverview.push({
          name: persona.analyticsNav.label,
          href: persona.analyticsNav.href,
          icon: LayoutDashboard,
          anyOf: [...SUPPLIER_ANALYTICS_ANY_OF],
          testId: 'nav-dashboard',
        })
      }

      sections = [
        ...(supplierOverview.length
          ? [
              {
                label: 'OVERVIEW',
                items: supplierOverview.filter((item) => navItemAllowed(item, can, canAny)),
              },
            ]
          : []),
        { label: 'OPERATIONS', items: ops },
        ...(intel.length ? [{ label: 'INTELLIGENCE', items: intel }] : []),
        {
          label: 'ACCOUNT',
          items: [
            {
              name: 'Settings',
              href: '/app/settings',
              icon: Settings,
              permission: 'SETTINGS_VIEW',
              testId: 'nav-settings',
            },
          ].filter((item) => navItemAllowed(item, can, canAny)),
        },
      ]
    }
  }

  sections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => navItemAllowed(item, can, canAny)),
    }))
    .filter((section) => section.items.length > 0)

  return reorderNavSectionsForPrimaryFocus(sections, persona.primaryNavHref)
}
