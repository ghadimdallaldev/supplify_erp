import type {
  PermissionCheck,
  RestaurantDashboardMode,
  WorkspacePersonaId,
  WorkspacePersonaProfile,
} from './shared'
import {
  DEFAULT_PROMOTIONS_COPY,
  RESTAURANT_DASHBOARD_ANY_OF,
  RESTAURANT_REPORTS_ANY_OF,
} from './shared'

const RESTAURANT_ROLE_ALIASES: Record<string, WorkspacePersonaId> = {
  Owner: 'restaurant_owner',
  'Restaurant Manager': 'restaurant_manager',
  Manager: 'restaurant_manager',
  Purchaser: 'restaurant_purchaser',
  'Receiving Staff': 'restaurant_receiving',
  'Inventory Clerk': 'restaurant_receiving',
  Accountant: 'restaurant_accountant',
  'Finance Staff': 'restaurant_accountant',
  Viewer: 'restaurant_viewer',
  'Read-only Staff': 'restaurant_viewer',
  'FOH Staff': 'restaurant_foh',
  'Reservations/Host Staff': 'restaurant_foh',
}

export const RESTAURANT_PROFILES = {
  restaurant_owner: {
    id: 'restaurant_owner',
    homePath: '/app/dashboard',
    primaryNavHref: '/app/dashboard',
    overviewNav: null,
    analyticsNav: { label: 'Restaurant dashboard', href: '/app/dashboard' },
    showGlobalReports: true,
    commandCenterMode: null,
    dashboard: {
      title: 'Restaurant dashboard',
      description: 'Spending, orders, and supplier relationships at a glance.',
      kpiKeys: ['revenue', 'orders', 'pending', 'counterpart'],
      kpiLabels: {
        revenue: { label: 'Total spent', meta: 'All-time' },
        orders: { label: 'My orders', meta: 'All orders' },
        pending: { label: 'In progress', meta: 'Awaiting delivery' },
        counterpart: { label: 'Suppliers', meta: 'Active vendors' },
      },
    },
    promotionsCopy: DEFAULT_PROMOTIONS_COPY,
    readOnly: false,
    roleLabel: 'Owner',
    restaurantDashboardMode: 'full',
    pageCopy: {
      cart: { title: 'Shopping cart', description: 'Review and place supplier orders' },
      orders: { title: 'Orders inbox', description: 'All team orders and delivery status' },
      receiving: {
        title: 'Receiving desk',
        description: 'Confirm deliveries and record quality issues',
      },
      reservations: { title: 'Reservations', description: 'Bookings, waitlist, and guest flow' },
      invoices: { title: 'Invoice dashboard', description: 'Billing, payments, and spend' },
    },
  },
  restaurant_manager: {
    id: 'restaurant_manager',
    homePath: '/app/orders',
    primaryNavHref: '/app/orders',
    overviewNav: null,
    analyticsNav: { label: 'Operations dashboard', href: '/app/dashboard' },
    showGlobalReports: true,
    commandCenterMode: null,
    dashboard: {
      title: 'Operations dashboard',
      description: 'Orders, receiving, and day-to-day purchasing activity.',
      kpiKeys: ['revenue', 'orders', 'pending', 'counterpart'],
      kpiLabels: {
        revenue: { label: 'Spend (30d)', meta: 'Recent purchasing' },
        orders: { label: 'Orders', meta: 'Placed by your team' },
        pending: { label: 'Open orders', meta: 'In flight' },
        counterpart: { label: 'Suppliers', meta: 'You order from' },
      },
    },
    promotionsCopy: DEFAULT_PROMOTIONS_COPY,
    readOnly: false,
    roleLabel: 'Restaurant Manager',
    restaurantDashboardMode: 'operations',
    pageCopy: {
      cart: { title: 'Ordering cart', description: 'Build orders for your suppliers' },
      orders: {
        title: 'Operations inbox',
        description: 'Team orders, receiving, and fulfillment status',
      },
      receiving: {
        title: 'Receiving desk',
        description: 'Confirm deliveries and open disputes when needed',
      },
      reservations: { title: 'Reservations', description: 'Today’s bookings and floor capacity' },
      invoices: { title: 'Invoices', description: 'Review supplier billing tied to orders' },
    },
  },
  restaurant_purchaser: {
    id: 'restaurant_purchaser',
    homePath: '/app/cart',
    primaryNavHref: '/app/cart',
    overviewNav: null,
    analyticsNav: { label: 'Ordering dashboard', href: '/app/dashboard' },
    showGlobalReports: false,
    commandCenterMode: null,
    dashboard: {
      title: 'Ordering dashboard',
      description: 'Your carts, orders, and supplier catalog activity.',
      kpiKeys: ['orders', 'pending', 'counterpart'],
      kpiLabels: {
        orders: { label: 'My orders', meta: 'Placed by you' },
        pending: { label: 'Awaiting delivery', meta: 'Track status' },
        counterpart: { label: 'Suppliers', meta: 'Available to order' },
      },
    },
    promotionsCopy: DEFAULT_PROMOTIONS_COPY,
    readOnly: false,
    roleLabel: 'Purchaser',
    restaurantDashboardMode: 'ordering',
    pageCopy: {
      cart: { title: 'Ordering cart', description: 'Build and submit supplier orders' },
      orders: { title: 'My orders', description: 'Track orders you have placed' },
      receiving: { title: 'Receiving', description: 'Delivery confirmations for your site' },
      invoices: { title: 'Invoices', description: 'Billing on your placed orders' },
    },
  },
  restaurant_receiving: {
    id: 'restaurant_receiving',
    homePath: '/app/receiving',
    primaryNavHref: '/app/receiving',
    overviewNav: { label: 'Receiving desk', href: '/app/receiving', gate: 'command_center' },
    analyticsNav: null,
    showGlobalReports: false,
    commandCenterMode: null,
    dashboard: null,
    promotionsCopy: DEFAULT_PROMOTIONS_COPY,
    readOnly: false,
    roleLabel: 'Receiving Staff',
    restaurantDashboardMode: null,
    pageCopy: {
      receiving: {
        title: 'Receiving desk',
        description: 'Confirm deliveries, record quality issues, and open disputes',
      },
      orders: {
        title: 'Deliveries to receive',
        description: 'Orders awaiting confirmation on site',
      },
    },
  },
  restaurant_accountant: {
    id: 'restaurant_accountant',
    homePath: '/app/invoices',
    primaryNavHref: '/app/invoices',
    overviewNav: null,
    analyticsNav: { label: 'Finance dashboard', href: '/app/dashboard' },
    showGlobalReports: true,
    commandCenterMode: null,
    dashboard: {
      title: 'Finance dashboard',
      description: 'Invoice spend, payments, and supplier billing.',
      kpiKeys: ['revenue', 'orders', 'counterpart'],
      kpiLabels: {
        revenue: { label: 'Invoice spend', meta: 'Recent period' },
        orders: { label: 'Billed orders', meta: 'With invoices' },
        counterpart: { label: 'Suppliers', meta: 'Billing relationships' },
      },
    },
    promotionsCopy: DEFAULT_PROMOTIONS_COPY,
    readOnly: false,
    roleLabel: 'Accountant',
    restaurantDashboardMode: 'finance',
    pageCopy: {
      orders: { title: 'Billed orders', description: 'Orders with supplier invoices' },
      invoices: {
        title: 'Finance desk',
        description: 'Invoice spend, payments, and supplier billing',
      },
    },
  },
  restaurant_foh: {
    id: 'restaurant_foh',
    homePath: '/app/reservations',
    primaryNavHref: '/app/reservations',
    overviewNav: { label: 'Host desk', href: '/app/reservations', gate: 'command_center' },
    analyticsNav: null,
    showGlobalReports: false,
    commandCenterMode: null,
    dashboard: null,
    promotionsCopy: DEFAULT_PROMOTIONS_COPY,
    readOnly: false,
    roleLabel: 'FOH Staff',
    restaurantDashboardMode: null,
    pageCopy: {
      reservations: {
        title: 'Host desk',
        description: 'Bookings, waitlist, and guest arrivals for today',
      },
    },
  },
  restaurant_viewer: {
    id: 'restaurant_viewer',
    homePath: '/app/dashboard',
    primaryNavHref: '/app/dashboard',
    overviewNav: null,
    analyticsNav: { label: 'Workspace overview', href: '/app/dashboard' },
    showGlobalReports: true,
    commandCenterMode: null,
    dashboard: {
      title: 'Workspace overview',
      description: 'Read-only view of restaurant activity.',
      kpiKeys: ['revenue', 'orders', 'pending', 'counterpart'],
      kpiLabels: {
        revenue: { label: 'Total spent', meta: 'All-time' },
        orders: { label: 'Orders', meta: 'All orders' },
        pending: { label: 'In progress', meta: 'Open orders' },
        counterpart: { label: 'Suppliers', meta: 'Vendors' },
      },
    },
    promotionsCopy: DEFAULT_PROMOTIONS_COPY,
    readOnly: true,
    roleLabel: 'Viewer',
    restaurantDashboardMode: 'readonly',
    pageCopy: {
      cart: { title: 'Cart', description: 'Read-only view of ordering cart' },
      orders: { title: 'Orders', description: 'Read-only order history and status' },
      receiving: { title: 'Receiving', description: 'Read-only delivery confirmations' },
      reservations: { title: 'Reservations', description: 'Read-only bookings overview' },
      invoices: { title: 'Invoices', description: 'Read-only billing and payments' },
    },
  },
} as const

export function resolveRestaurantPersonaId(
  roleName: string | null,
  can: PermissionCheck
): WorkspacePersonaId {
  if (roleName && RESTAURANT_ROLE_ALIASES[roleName]) return RESTAURANT_ROLE_ALIASES[roleName]
  if (can('RESERVATIONS_VIEW') && !can('ORDERS_CREATE') && !can('RECEIVING_VIEW')) {
    return 'restaurant_foh'
  }
  if (can('RECEIVING_MANAGE') && !can('ORDERS_CREATE')) return 'restaurant_receiving'
  if (can('INVOICES_VIEW') && !can('ORDERS_CREATE') && !can('RECEIVING_VIEW')) {
    return 'restaurant_accountant'
  }
  if (can('ORDERS_CREATE') && !can('RECEIVING_MANAGE') && !can('INVOICES_MANAGE')) {
    return 'restaurant_purchaser'
  }
  if (can('ORDERS_VIEW') && !can('ORDERS_CREATE')) return 'restaurant_viewer'
  return 'restaurant_manager'
}

export type RestaurantDashboardLayout = {
  showRecentOrders: boolean
  showSpendTrend: boolean
  showReorderAlerts: boolean
  showExpiry: boolean
  showReorderReminders: boolean
  showCalendar: boolean
  showPostOnboardingCta: boolean
  allowReorderActions: boolean
}

export function getRestaurantDashboardLayout(
  mode: RestaurantDashboardMode,
  can: PermissionCheck,
  readOnly = false
): RestaurantDashboardLayout {
  const hasInventory = can('INVENTORY_VIEW')
  const canOrder = can('ORDERS_CREATE') || can('ORDERS_MANAGE')
  const allowActions = canOrder && !readOnly

  switch (mode) {
    case 'ordering':
      return {
        showRecentOrders: true,
        showSpendTrend: true,
        showReorderAlerts: true,
        showExpiry: hasInventory,
        showReorderReminders: true,
        showCalendar: false,
        showPostOnboardingCta: can('ORDERS_CREATE') && !readOnly,
        allowReorderActions: allowActions,
      }
    case 'finance':
      return {
        showRecentOrders: true,
        showSpendTrend: true,
        showReorderAlerts: false,
        showExpiry: false,
        showReorderReminders: false,
        showCalendar: false,
        showPostOnboardingCta: false,
        allowReorderActions: false,
      }
    case 'operations':
      return {
        showRecentOrders: true,
        showSpendTrend: true,
        showReorderAlerts: true,
        showExpiry: hasInventory,
        showReorderReminders: true,
        showCalendar: true,
        showPostOnboardingCta: can('ORDERS_CREATE') && !readOnly,
        allowReorderActions: allowActions,
      }
    case 'readonly':
      return {
        showRecentOrders: can('ORDERS_VIEW'),
        showSpendTrend: can('ORDERS_VIEW') || can('INVOICES_VIEW'),
        showReorderAlerts: can('ORDERS_VIEW') && hasInventory,
        showExpiry: hasInventory,
        showReorderReminders: can('ORDERS_VIEW'),
        showCalendar: can('RESERVATIONS_VIEW') || can('ORDERS_VIEW'),
        showPostOnboardingCta: false,
        allowReorderActions: false,
      }
    case 'full':
    default:
      return {
        showRecentOrders: true,
        showSpendTrend: true,
        showReorderAlerts: true,
        showExpiry: hasInventory,
        showReorderReminders: true,
        showCalendar: true,
        showPostOnboardingCta: can('ORDERS_CREATE') && !readOnly,
        allowReorderActions: allowActions,
      }
  }
}

export function restaurantOverviewNavAllowed(
  profile: WorkspacePersonaProfile,
  can: PermissionCheck
): boolean {
  if (!profile.overviewNav) return false
  if (profile.id === 'restaurant_foh') return can('RESERVATIONS_VIEW')
  if (profile.id === 'restaurant_receiving') return can('RECEIVING_VIEW')
  return false
}

export function restaurantAnalyticsNavAllowed(
  profile: WorkspacePersonaProfile,
  can: PermissionCheck
): boolean {
  if (!profile.analyticsNav || !profile.dashboard) return false
  return RESTAURANT_DASHBOARD_ANY_OF.some((p) => can(p))
}

export function restaurantReportsNavAllowed(
  profile: WorkspacePersonaProfile,
  can: PermissionCheck
): boolean {
  if (!profile.showGlobalReports) return false
  return RESTAURANT_REPORTS_ANY_OF.some((p) => can(p))
}

/** Ops order calendar on /app/dashboard — not for finance- or desk-focused roles. */
export function shouldShowDashboardCalendar(
  profile: WorkspacePersonaProfile,
  tenantType: 'SUPPLIER' | 'RESTAURANT' | null | undefined,
  can: PermissionCheck
): boolean {
  if (tenantType === 'RESTAURANT') {
    if (profile.restaurantDashboardMode) {
      return getRestaurantDashboardLayout(profile.restaurantDashboardMode, can, profile.readOnly)
        .showCalendar
    }
    return true
  }
  if (tenantType === 'SUPPLIER') {
    if (profile.commandCenterMode === 'finance' || profile.id === 'supplier_accountant') {
      return false
    }
    if (
      profile.commandCenterMode === 'sales' ||
      profile.commandCenterMode === 'catalog' ||
      profile.id === 'supplier_driver'
    ) {
      return false
    }
    return true
  }
  return true
}
