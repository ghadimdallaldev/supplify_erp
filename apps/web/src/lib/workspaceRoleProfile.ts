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

const DEFAULT_PROMOTIONS_COPY = {
  title: 'Deals & promotions',
  subtitle: 'View supplier campaigns and performance.',
  listTitle: 'Campaigns',
  newButton: 'New promotion',
  performanceTitle: 'Deals performance (30 days)',
}

const SUPPLIER_ROLE_ALIASES: Record<string, WorkspacePersonaId> = {
  Owner: 'supplier_owner',
  'Supplier Manager': 'supplier_manager',
  Manager: 'supplier_manager',
  'Admin/Manager': 'supplier_manager',
  'Warehouse Manager': 'supplier_warehouse',
  'Order Fulfillment Staff': 'supplier_fulfillment',
  'Warehouse Staff': 'supplier_fulfillment',
  'Fulfillment Staff': 'supplier_fulfillment',
  Driver: 'supplier_driver',
  'Catalog Manager': 'supplier_catalog',
  'Catalog/Product Manager': 'supplier_catalog',
  'Promotions Manager': 'supplier_promotions',
  'Sales Rep': 'supplier_promotions',
  'Sales/Deals Manager': 'supplier_promotions',
  Accountant: 'supplier_accountant',
  'Finance Staff': 'supplier_accountant',
  Viewer: 'supplier_viewer',
  'Read-only Staff': 'supplier_viewer',
  'Org Viewer': 'supplier_viewer',
}

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

const PROFILES: Record<WorkspacePersonaId, WorkspacePersonaProfile> = {
  supplier_owner: {
    id: 'supplier_owner',
    homePath: '/app/command-center',
    primaryNavHref: '/app/command-center',
    overviewNav: { label: 'Command Center', href: '/app/command-center', gate: 'command_center' },
    analyticsNav: { label: 'Analytics', href: '/app/dashboard' },
    showGlobalReports: true,
    commandCenterMode: 'full',
    dashboard: {
      title: 'Business analytics',
      description: 'Revenue, orders, and customer trends across your supplier workspace.',
      kpiKeys: ['revenue', 'orders', 'pending', 'counterpart'],
      kpiLabels: {
        revenue: { label: 'Revenue', meta: 'All-time' },
        orders: { label: 'Orders', meta: 'All orders' },
        pending: { label: 'Pending', meta: 'Awaiting fulfillment' },
        counterpart: { label: 'Restaurants', meta: 'Active customers' },
      },
    },
    promotionsCopy: {
      title: 'Deals & promotions',
      subtitle: 'Create campaigns and track performance across your restaurant network.',
      listTitle: 'Your promotions',
      newButton: 'New promotion',
      performanceTitle: 'Deals performance (30 days)',
    },
    readOnly: false,
    roleLabel: 'Owner',
  },
  supplier_manager: {
    id: 'supplier_manager',
    homePath: '/app/command-center',
    primaryNavHref: '/app/command-center',
    overviewNav: { label: 'Command Center', href: '/app/command-center', gate: 'command_center' },
    analyticsNav: { label: 'Analytics', href: '/app/dashboard' },
    showGlobalReports: true,
    commandCenterMode: 'full',
    dashboard: {
      title: 'Operations analytics',
      description: 'Daily order volume, fulfillment backlog, and customer activity.',
      kpiKeys: ['revenue', 'orders', 'pending', 'counterpart'],
      kpiLabels: {
        revenue: { label: 'Revenue', meta: 'All-time' },
        orders: { label: 'Orders', meta: 'All orders' },
        pending: { label: 'Pending orders', meta: 'Need action' },
        counterpart: { label: 'Restaurants', meta: 'Ordering from you' },
      },
    },
    promotionsCopy: {
      title: 'Deals & promotions',
      subtitle: 'Create campaigns and track performance across your restaurant network.',
      listTitle: 'Your promotions',
      newButton: 'New promotion',
      performanceTitle: 'Deals performance (30 days)',
    },
    readOnly: false,
    roleLabel: 'Supplier Manager',
  },
  supplier_warehouse: {
    id: 'supplier_warehouse',
    homePath: '/app/fulfillment',
    primaryNavHref: '/app/fulfillment',
    overviewNav: { label: 'Fulfillment Hub', href: '/app/command-center', gate: 'command_center' },
    analyticsNav: { label: 'Warehouse analytics', href: '/app/dashboard' },
    showGlobalReports: true,
    commandCenterMode: 'fulfillment',
    dashboard: {
      title: 'Warehouse analytics',
      description: 'Orders to pick, deliveries in progress, and stock alerts.',
      kpiKeys: ['orders', 'pending', 'counterpart'],
      kpiLabels: {
        orders: { label: 'Orders today', meta: 'In the pipeline' },
        pending: { label: 'Awaiting dispatch', meta: 'Fulfillment queue' },
        counterpart: { label: 'Destinations', meta: 'Restaurants served' },
      },
    },
    promotionsCopy: DEFAULT_PROMOTIONS_COPY,
    readOnly: false,
    roleLabel: 'Warehouse Manager',
  },
  supplier_fulfillment: {
    id: 'supplier_fulfillment',
    homePath: '/app/fulfillment',
    primaryNavHref: '/app/fulfillment',
    overviewNav: { label: 'Fulfillment Hub', href: '/app/command-center', gate: 'command_center' },
    analyticsNav: { label: 'Delivery analytics', href: '/app/dashboard' },
    showGlobalReports: false,
    commandCenterMode: 'fulfillment',
    dashboard: {
      title: 'Delivery analytics',
      description: 'Track orders and deliveries you are responsible for.',
      kpiKeys: ['orders', 'pending'],
      kpiLabels: {
        orders: { label: 'Assigned orders', meta: 'Your queue' },
        pending: { label: 'In progress', meta: 'Needs update' },
      },
    },
    promotionsCopy: DEFAULT_PROMOTIONS_COPY,
    readOnly: false,
    roleLabel: 'Fulfillment Staff',
  },
  supplier_driver: {
    id: 'supplier_driver',
    homePath: '/app/driver-deliveries',
    primaryNavHref: '/app/driver-deliveries',
    overviewNav: null,
    analyticsNav: null,
    showGlobalReports: false,
    commandCenterMode: null,
    dashboard: null,
    promotionsCopy: DEFAULT_PROMOTIONS_COPY,
    readOnly: false,
    roleLabel: 'Driver',
  },
  supplier_catalog: {
    id: 'supplier_catalog',
    homePath: '/app/products',
    primaryNavHref: '/app/products',
    overviewNav: { label: 'Catalog Hub', href: '/app/command-center', gate: 'command_center' },
    analyticsNav: { label: 'Catalog analytics', href: '/app/dashboard' },
    showGlobalReports: true,
    commandCenterMode: 'catalog',
    dashboard: {
      title: 'Catalog analytics',
      description: 'Product catalog health, order context, and stock coverage.',
      kpiKeys: ['orders', 'counterpart'],
      kpiLabels: {
        orders: { label: 'Related orders', meta: 'Catalog demand' },
        counterpart: { label: 'Restaurants', meta: 'Buying your SKUs' },
      },
    },
    promotionsCopy: DEFAULT_PROMOTIONS_COPY,
    readOnly: false,
    roleLabel: 'Catalog Manager',
  },
  supplier_promotions: {
    id: 'supplier_promotions',
    homePath: '/app/promotions',
    primaryNavHref: '/app/promotions',
    overviewNav: { label: 'Sales Hub', href: '/app/command-center', gate: 'promotions' },
    analyticsNav: null,
    showGlobalReports: false,
    commandCenterMode: 'sales',
    dashboard: null,
    promotionsCopy: {
      title: 'Deals & promotions',
      subtitle: 'Run campaigns, follow up on reorder leads, and measure deal ROI.',
      listTitle: 'Your campaigns',
      newButton: 'New deal',
      performanceTitle: 'All deals performance (30 days)',
    },
    readOnly: false,
    roleLabel: 'Promotions Manager',
  },
  supplier_accountant: {
    id: 'supplier_accountant',
    homePath: '/app/invoices',
    primaryNavHref: '/app/invoices',
    overviewNav: { label: 'Finance Hub', href: '/app/command-center', gate: 'command_center' },
    analyticsNav: { label: 'Finance analytics', href: '/app/dashboard' },
    showGlobalReports: true,
    commandCenterMode: 'finance',
    dashboard: {
      title: 'Finance analytics',
      description: 'Receivables, collections, and invoice activity.',
      kpiKeys: ['revenue', 'pending', 'counterpart'],
      kpiLabels: {
        revenue: { label: 'Outstanding balance', meta: 'Open receivables' },
        orders: { label: 'Invoiced orders', meta: 'Billing pipeline' },
        pending: { label: 'Overdue accounts', meta: 'Needs collection' },
        counterpart: { label: 'Debtors', meta: 'Restaurants with balance' },
      },
    },
    promotionsCopy: DEFAULT_PROMOTIONS_COPY,
    readOnly: false,
    roleLabel: 'Accountant',
  },
  supplier_viewer: {
    id: 'supplier_viewer',
    homePath: '/app/command-center',
    primaryNavHref: '/app/command-center',
    overviewNav: {
      label: 'Workspace overview',
      href: '/app/command-center',
      gate: 'command_center',
    },
    analyticsNav: { label: 'Analytics', href: '/app/dashboard' },
    showGlobalReports: true,
    commandCenterMode: 'readonly',
    dashboard: {
      title: 'Workspace overview',
      description: 'Read-only snapshot of supplier performance.',
      kpiKeys: ['revenue', 'orders', 'pending', 'counterpart'],
      kpiLabels: {
        revenue: { label: 'Revenue', meta: 'All-time' },
        orders: { label: 'Orders', meta: 'All orders' },
        pending: { label: 'Pending', meta: 'In progress' },
        counterpart: { label: 'Restaurants', meta: 'Customers' },
      },
    },
    promotionsCopy: DEFAULT_PROMOTIONS_COPY,
    readOnly: true,
    roleLabel: 'Viewer',
  },
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
  generic: {
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
  },
}

export function isPromotionsFocusedSupplier(can: PermissionCheck): boolean {
  return (
    can('PROMOTIONS_VIEW') &&
    !can('FULFILLMENT_VIEW') &&
    !can('INVOICES_VIEW') &&
    !can('CATALOG_EDIT') &&
    !can('CATALOG_MANAGE')
  )
}

function resolveSupplierPersonaId(
  roleName: string | null,
  can: PermissionCheck,
  isDriver: boolean
): WorkspacePersonaId {
  if (isDriver) return 'supplier_driver'
  if (roleName && SUPPLIER_ROLE_ALIASES[roleName]) return SUPPLIER_ROLE_ALIASES[roleName]
  if (isPromotionsFocusedSupplier(can)) return 'supplier_promotions'
  if (can('INVOICES_VIEW') && !can('FULFILLMENT_VIEW') && !can('CATALOG_EDIT')) {
    return 'supplier_accountant'
  }
  if ((can('CATALOG_EDIT') || can('CATALOG_MANAGE')) && !can('FULFILLMENT_MANAGE')) {
    return 'supplier_catalog'
  }
  if (can('FULFILLMENT_MANAGE') && can('WAREHOUSES_EDIT')) return 'supplier_warehouse'
  if (can('FULFILLMENT_MANAGE') && !can('INVOICES_VIEW') && !can('CATALOG_MANAGE')) {
    return 'supplier_fulfillment'
  }
  if (can('FULFILLMENT_VIEW') && can('ORDERS_MANAGE')) return 'supplier_manager'
  if (
    can('ORDERS_VIEW') &&
    !can('ORDERS_MANAGE') &&
    !can('CATALOG_EDIT') &&
    !can('FULFILLMENT_VIEW')
  ) {
    return 'supplier_viewer'
  }
  return 'supplier_manager'
}

function resolveRestaurantPersonaId(
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

export function resolveWorkspacePersona(input: {
  tenantType: 'SUPPLIER' | 'RESTAURANT' | null | undefined
  roleName: string | null | undefined
  can: PermissionCheck
  isDriver?: boolean
}): WorkspacePersonaProfile {
  const { tenantType, roleName, can, isDriver = false } = input
  let id: WorkspacePersonaId = 'generic'
  if (tenantType === 'SUPPLIER') {
    id = resolveSupplierPersonaId(roleName ?? null, can, isDriver)
  } else if (tenantType === 'RESTAURANT') {
    id = resolveRestaurantPersonaId(roleName ?? null, can)
  }
  return PROFILES[id] ?? PROFILES.generic
}

export type CommandCenterLayout = {
  showOpsKpis: boolean
  showSalesKpi: boolean
  showFinanceKpi: boolean
  showPriorities: boolean
  showDeliveryPreview: boolean
  showReceivablesPreview: boolean
  showLowStockPreview: boolean
  showReorder: boolean
  showAtRisk: boolean
  showBoostedDeals: boolean
  showDisputeAlerts: boolean
  showFulfillmentAlerts: boolean
  showAnalyticsLink: boolean
  allowReorderActions: boolean
  quickActions: 'ops' | 'sales' | 'fulfillment' | 'catalog' | 'finance'
}

export function getCommandCenterLayout(
  mode: CommandCenterMode,
  can: PermissionCheck
): CommandCenterLayout {
  const allowReorderActions = can('ORDERS_MANAGE') || can('PROMOTIONS_MANAGE')
  switch (mode) {
    case 'sales':
      return {
        showOpsKpis: false,
        showSalesKpi: true,
        showFinanceKpi: false,
        showPriorities: false,
        showDeliveryPreview: false,
        showReceivablesPreview: false,
        showLowStockPreview: false,
        showReorder: true,
        showAtRisk: true,
        showBoostedDeals: true,
        showDisputeAlerts: false,
        showFulfillmentAlerts: false,
        showAnalyticsLink: false,
        allowReorderActions,
        quickActions: 'sales',
      }
    case 'fulfillment':
      return {
        showOpsKpis: true,
        showSalesKpi: false,
        showFinanceKpi: false,
        showPriorities: true,
        showDeliveryPreview: true,
        showReceivablesPreview: false,
        showLowStockPreview: can('INVENTORY_VIEW'),
        showReorder: false,
        showAtRisk: false,
        showBoostedDeals: false,
        showDisputeAlerts: can('FULFILLMENT_VIEW'),
        showFulfillmentAlerts: true,
        showAnalyticsLink: canAnySupplierAnalytics(can),
        allowReorderActions: false,
        quickActions: 'fulfillment',
      }
    case 'catalog':
      return {
        showOpsKpis: false,
        showSalesKpi: false,
        showFinanceKpi: false,
        showPriorities: false,
        showDeliveryPreview: false,
        showReceivablesPreview: false,
        showLowStockPreview: true,
        showReorder: false,
        showAtRisk: false,
        showBoostedDeals: false,
        showDisputeAlerts: false,
        showFulfillmentAlerts: false,
        showAnalyticsLink: canAnySupplierAnalytics(can),
        allowReorderActions: false,
        quickActions: 'catalog',
      }
    case 'finance':
      return {
        showOpsKpis: false,
        showSalesKpi: false,
        showFinanceKpi: true,
        showPriorities: false,
        showDeliveryPreview: false,
        showReceivablesPreview: true,
        showLowStockPreview: false,
        showReorder: false,
        showAtRisk: false,
        showBoostedDeals: false,
        showDisputeAlerts: false,
        showFulfillmentAlerts: false,
        showAnalyticsLink: canAnySupplierAnalytics(can),
        allowReorderActions: false,
        quickActions: 'finance',
      }
    case 'readonly':
      return {
        showOpsKpis: true,
        showSalesKpi: true,
        showFinanceKpi: can('INVOICES_VIEW'),
        showPriorities: true,
        showDeliveryPreview: can('FULFILLMENT_VIEW'),
        showReceivablesPreview: can('INVOICES_VIEW'),
        showLowStockPreview: can('INVENTORY_VIEW'),
        showReorder: can('ORDERS_VIEW'),
        showAtRisk: can('PROMOTIONS_VIEW') || can('ORDERS_VIEW'),
        showBoostedDeals: can('PROMOTIONS_VIEW'),
        showDisputeAlerts: can('FULFILLMENT_VIEW'),
        showFulfillmentAlerts: can('FULFILLMENT_VIEW'),
        showAnalyticsLink: canAnySupplierAnalytics(can),
        allowReorderActions: false,
        quickActions: 'ops',
      }
    case 'full':
    default:
      return {
        showOpsKpis: true,
        showSalesKpi: true,
        showFinanceKpi: true,
        showPriorities: true,
        showDeliveryPreview: true,
        showReceivablesPreview: true,
        showLowStockPreview: true,
        showReorder: true,
        showAtRisk: true,
        showBoostedDeals: true,
        showDisputeAlerts: true,
        showFulfillmentAlerts: true,
        showAnalyticsLink: canAnySupplierAnalytics(can),
        allowReorderActions,
        quickActions: 'ops',
      }
  }
}

function canAnySupplierAnalytics(can: PermissionCheck): boolean {
  return SUPPLIER_ANALYTICS_ANY_OF.some((p) => can(p))
}

export function supplierOverviewNavAllowed(
  profile: WorkspacePersonaProfile,
  can: PermissionCheck,
  canAny: (...keys: string[]) => boolean
): boolean {
  if (!profile.overviewNav) return false
  if (profile.overviewNav.gate === 'promotions') return can('PROMOTIONS_VIEW')
  return canAny(
    'ORDERS_MANAGE',
    'INVOICES_VIEW',
    'CATALOG_EDIT',
    'FULFILLMENT_VIEW',
    'PROMOTIONS_MANAGE',
    'PROMOTIONS_VIEW'
  )
}

export function supplierAnalyticsNavAllowed(
  profile: WorkspacePersonaProfile,
  can: PermissionCheck
) {
  if (!profile.analyticsNav) return false
  return SUPPLIER_ANALYTICS_ANY_OF.some((p) => can(p))
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

/** Puts the role's primary nav link at the top of the sidebar (first thing visible). */
export function reorderNavSectionsForPrimaryFocus<T extends { href: string }>(
  sections: Array<{ label: string; items: T[] }>,
  primaryHref: string
): Array<{ label: string; items: T[] }> {
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

  const overviewIdx = rest.findIndex((s) => s.label === 'OVERVIEW')
  if (overviewIdx >= 0) {
    const overview = rest[overviewIdx]
    rest[overviewIdx] = {
      ...overview,
      items: [primary, ...overview.items],
    }
    return rest
  }

  return [{ label: 'OVERVIEW', items: [primary] }, ...rest]
}
