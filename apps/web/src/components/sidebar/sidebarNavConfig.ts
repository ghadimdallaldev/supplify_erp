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
  UtensilsCrossed,
  ShoppingBasket,
  Gift,
  UserPlus,
  ClipboardList,
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
  /** Display label for persona-driven or legacy entries */
  name?: string
  /** Translation key in the navigation namespace */
  nameKey?: string
  href: string
  icon: any
  permission?: string
  anyOf?: string[]
  badge?: 'pending' | 'unread' | 'disputes'
  testId?: string
}

export type SidebarNavSectionConfig = {
  label?: string
  labelKey?: string
  items: SidebarNavItem[]
}

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
  supplierGrowthEnabled: boolean
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
    supplierGrowthEnabled,
  } = input

  let sections: SidebarNavSectionConfig[] = []
  if (isRestaurant || impersonatingRestaurant) {
    const ops: SidebarNavItem[] = [
      {
        nameKey: 'orders',
        href: '/app/orders',
        icon: ShoppingCart,
        badge: 'pending' as const,
        permission: 'ORDERS_VIEW',
        testId: 'nav-orders',
      },
      {
        nameKey: 'products',
        href: '/app/products',
        icon: Package,
        permission: 'CATALOG_VIEW',
        testId: 'nav-products',
      },
      {
        nameKey: 'myPrices',
        href: '/app/my-prices',
        icon: Percent,
        permission: 'CATALOG_VIEW',
        testId: 'nav-my-prices',
      },
      ...(quickListsEnabled
        ? [
            {
              nameKey: 'orderingLists',
              href: '/app/quick-lists',
              icon: List,
              permission: 'ORDERS_VIEW',
              testId: 'nav-quick-lists',
            },
          ]
        : []),
      {
        nameKey: 'cart',
        href: '/app/cart',
        icon: ShoppingBag,
        permission: 'ORDERS_CREATE',
        testId: 'nav-cart',
      },
      {
        nameKey: 'quoteRequests',
        href: '/app/quote-requests',
        icon: FileQuestion,
        permission: 'ORDERS_CREATE',
        testId: 'nav-quote-requests',
      },
      {
        nameKey: 'receiving',
        href: '/app/receiving',
        icon: PackageCheck,
        permission: 'RECEIVING_VIEW',
        testId: 'nav-receiving',
      },
    ].filter((item) => navItemAllowed(item, can, canAny))

    const intel: SidebarNavItem[] = [
      {
        nameKey: 'suppliers',
        href: '/app/suppliers',
        icon: Building2,
        permission: 'CATALOG_VIEW',
        testId: 'nav-suppliers',
      },
      ...(reportsEnabled && restaurantReportsNavAllowed(persona, can)
        ? [
            {
              nameKey: 'reports',
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
              nameKey: 'disputes',
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
              nameKey: 'deals',
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
              nameKey: 'invoices',
              href: '/app/invoices',
              icon: FileText,
              permission: 'INVOICES_VIEW',
              testId: 'nav-invoices',
            },
          ]
        : []),
      {
        nameKey: 'chat',
        href: '/app/chat',
        icon: MessageSquare,
        permission: 'CHAT_VIEW',
        testId: 'nav-chat',
      },
    ].filter((item) => navItemAllowed(item, can, canAny))

    const acct: SidebarNavItem[] = [
      {
        nameKey: 'inventory',
        href: '/app/restaurant-inventory',
        icon: Package2,
        permission: 'INVENTORY_VIEW',
        testId: 'nav-inventory',
      },
      {
        nameKey: 'settings',
        href: '/app/settings',
        icon: Settings,
        permission: 'SETTINGS_VIEW',
        testId: 'nav-settings',
      },
    ].filter((item) => navItemAllowed(item, can, canAny))

    const hospitalityAddOns: SidebarNavItem[] = [
      {
        nameKey: 'reservations',
        href: '/app/reservations',
        icon: CalendarDays,
        permission: 'RESERVATIONS_VIEW',
        testId: 'nav-reservations',
      },
      {
        nameKey: 'staff',
        href: '/app/staff',
        icon: UserCircle2,
        permission: 'STAFF_VIEW',
        testId: 'nav-staff',
      },
      {
        nameKey: 'guestMenu',
        href: '/app/consumer-menu',
        icon: UtensilsCrossed,
        permission: 'CATALOG_VIEW',
        testId: 'nav-consumer-menu',
      },
      {
        nameKey: 'guestOrders',
        href: '/app/consumer-orders',
        icon: ShoppingBasket,
        permission: 'ORDERS_VIEW',
        testId: 'nav-consumer-orders',
      },
      {
        nameKey: 'guestRewards',
        href: '/app/consumer-loyalty',
        icon: Gift,
        permission: 'CATALOG_VIEW',
        testId: 'nav-consumer-loyalty',
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
              labelKey: 'section.overview',
              items: overviewItems.filter((item) => navItemAllowed(item, can, canAny)),
            },
          ]
        : []),
      { labelKey: 'section.operations', items: ops },
      ...(intel.length ? [{ labelKey: 'section.intelligence', items: intel }] : []),
      ...(acct.length ? [{ labelKey: 'section.account', items: acct }] : []),
      ...(hospitalityAddOns.length
        ? [{ labelKey: 'section.hospitalityAddOns', items: hospitalityAddOns }]
        : []),
    ]
  } else if (hasAdminNavAccess && !isImpersonating) {
    sections = [
      {
        labelKey: 'section.admin',
        items: [
          {
            nameKey: 'adminDashboard',
            href: '/app/admin',
            icon: Shield,
            testId: 'nav-admin-dashboard',
          },
          {
            nameKey: 'supplierAdmin',
            href: '/app/admin/suppliers',
            icon: Building2,
            testId: 'nav-supplier-admin',
          },
          {
            nameKey: 'restaurantAdmin',
            href: '/app/admin/restaurants',
            icon: Users,
            testId: 'nav-restaurant-admin',
          },
        ],
      },
      {
        labelKey: 'section.account',
        items: [
          { nameKey: 'settings', href: '/app/settings', icon: Settings, testId: 'nav-settings' },
        ],
      },
    ]
  } else if (isSupplier || impersonatingSupplier) {
    if (isDriverRole) {
      sections = [
        {
          labelKey: 'section.deliveries',
          items: [
            {
              nameKey: 'myDeliveries',
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
          nameKey: 'orders',
          href: '/app/orders',
          icon: ShoppingCart,
          badge: 'pending' as const,
          permission: 'ORDERS_VIEW',
          testId: 'nav-orders',
        },
        {
          nameKey: 'products',
          href: '/app/products',
          icon: Package,
          permission: 'CATALOG_VIEW',
          testId: 'nav-products',
        },
        {
          nameKey: 'contractPricing',
          href: '/app/contract-pricing',
          icon: Percent,
          permission: 'CATALOG_VIEW',
          testId: 'nav-contract-pricing',
        },
        ...(fulfillmentEnabled
          ? [
              {
                nameKey: 'fulfillment',
                href: '/app/fulfillment',
                icon: Truck,
                permission: 'FULFILLMENT_VIEW',
                testId: 'nav-fulfillment',
              },
              {
                name: 'Run sheet',
                href: '/app/run-sheet',
                icon: ClipboardList,
                anyOf: ['ORDERS_MANAGE', 'FULFILLMENT_VIEW', 'INVOICES_VIEW'],
                testId: 'nav-run-sheet',
              },
            ]
          : []),
        {
          nameKey: 'restaurants',
          href: '/app/restaurants',
          icon: Users,
          permission: 'ORDERS_VIEW',
          testId: 'nav-restaurants',
        },
        {
          nameKey: 'quoteInbox',
          href: '/app/quote-requests/supplier',
          icon: FileQuestion,
          permission: 'ORDERS_VIEW',
          testId: 'nav-supplier-quote-inbox',
        },
        ...(disputesEnabled
          ? [
              {
                nameKey: 'disputes',
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
        ...(supplierGrowthEnabled
          ? [
              {
                nameKey: 'customerGrowth',
                href: '/app/customer-growth',
                icon: UserPlus,
                permission: 'GROWTH_VIEW',
                testId: 'nav-customer-growth',
              },
            ]
          : []),
        ...(reportsEnabled && persona.showGlobalReports
          ? [
              {
                nameKey: 'reports',
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
                nameKey: 'deals',
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
                nameKey: 'invoices',
                href: '/app/invoices',
                icon: FileText,
                permission: 'INVOICES_VIEW',
                testId: 'nav-invoices',
              },
            ]
          : []),
        {
          nameKey: 'chat',
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
                labelKey: 'section.overview',
                items: supplierOverview.filter((item) => navItemAllowed(item, can, canAny)),
              },
            ]
          : []),
        { labelKey: 'section.operations', items: ops },
        ...(intel.length ? [{ labelKey: 'section.intelligence', items: intel }] : []),
        {
          labelKey: 'section.account',
          items: [
            {
              nameKey: 'settings',
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
