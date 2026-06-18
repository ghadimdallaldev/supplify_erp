import type {
  CommandCenterMode,
  PermissionCheck,
  WorkspacePersonaId,
  WorkspacePersonaProfile,
} from './shared'
import { DEFAULT_PROMOTIONS_COPY, SUPPLIER_ANALYTICS_ANY_OF } from './shared'

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

export const SUPPLIER_PROFILES = {
  supplier_owner: {
    id: 'supplier_owner',
    homePath: '/app/command-center',
    primaryNavHref: '/app/command-center',
    overviewNav: {
      label: 'Command Center',
      labelKey: 'commandCenter',
      href: '/app/command-center',
      gate: 'command_center',
    },
    analyticsNav: { label: 'Analytics', labelKey: 'analytics', href: '/app/dashboard' },
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
      title: 'Deals',
      subtitle:
        'Create supplier deals within your plan limits. Boosts are optional paid campaigns for sponsored placement.',
      listTitle: 'Your deals',
      newButton: 'Create deal',
      performanceTitle: 'Deals performance (30 days)',
    },
    readOnly: false,
    roleLabel: 'Owner',
  },
  supplier_manager: {
    id: 'supplier_manager',
    homePath: '/app/command-center',
    primaryNavHref: '/app/command-center',
    overviewNav: {
      label: 'Command Center',
      labelKey: 'commandCenter',
      href: '/app/command-center',
      gate: 'command_center',
    },
    analyticsNav: { label: 'Analytics', labelKey: 'analytics', href: '/app/dashboard' },
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
      title: 'Deals',
      subtitle:
        'Create supplier deals within your plan limits. Boosts are optional paid campaigns for sponsored placement.',
      listTitle: 'Your deals',
      newButton: 'Create deal',
      performanceTitle: 'Deals performance (30 days)',
    },
    readOnly: false,
    roleLabel: 'Supplier Manager',
  },
  supplier_warehouse: {
    id: 'supplier_warehouse',
    homePath: '/app/fulfillment',
    primaryNavHref: '/app/fulfillment',
    overviewNav: {
      label: 'Fulfillment Hub',
      labelKey: 'fulfillmentHub',
      href: '/app/command-center',
      gate: 'command_center',
    },
    analyticsNav: {
      label: 'Warehouse analytics',
      labelKey: 'warehouseAnalytics',
      href: '/app/dashboard',
    },
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
    overviewNav: {
      label: 'Fulfillment Hub',
      labelKey: 'fulfillmentHub',
      href: '/app/command-center',
      gate: 'command_center',
    },
    analyticsNav: {
      label: 'Delivery analytics',
      labelKey: 'deliveryAnalytics',
      href: '/app/dashboard',
    },
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
    overviewNav: {
      label: 'Catalog Hub',
      labelKey: 'catalogHub',
      href: '/app/command-center',
      gate: 'command_center',
    },
    analyticsNav: {
      label: 'Catalog analytics',
      labelKey: 'catalogAnalytics',
      href: '/app/dashboard',
    },
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
    overviewNav: {
      label: 'Sales Hub',
      labelKey: 'salesHub',
      href: '/app/command-center',
      gate: 'promotions',
    },
    analyticsNav: null,
    showGlobalReports: false,
    commandCenterMode: 'sales',
    dashboard: null,
    promotionsCopy: {
      title: 'Deals',
      subtitle:
        'Run deals, follow up on reorder leads, and measure ROI. Boosts add optional sponsored placement.',
      listTitle: 'Your deals',
      newButton: 'Create deal',
      performanceTitle: 'All deals performance (30 days)',
    },
    readOnly: false,
    roleLabel: 'Promotions Manager',
  },
  supplier_accountant: {
    id: 'supplier_accountant',
    homePath: '/app/invoices',
    primaryNavHref: '/app/invoices',
    overviewNav: {
      label: 'Finance Hub',
      labelKey: 'financeHub',
      href: '/app/command-center',
      gate: 'command_center',
    },
    analyticsNav: {
      label: 'Finance analytics',
      labelKey: 'financeAnalytics',
      href: '/app/dashboard',
    },
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
      labelKey: 'workspaceOverview',
      href: '/app/command-center',
      gate: 'command_center',
    },
    analyticsNav: { label: 'Analytics', labelKey: 'analytics', href: '/app/dashboard' },
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
} as const

export function isPromotionsFocusedSupplier(can: PermissionCheck): boolean {
  return (
    can('PROMOTIONS_VIEW') &&
    !can('FULFILLMENT_VIEW') &&
    !can('INVOICES_VIEW') &&
    !can('CATALOG_EDIT') &&
    !can('CATALOG_MANAGE')
  )
}

export function resolveSupplierPersonaId(
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

function canAnySupplierAnalytics(can: PermissionCheck): boolean {
  return SUPPLIER_ANALYTICS_ANY_OF.some((p) => can(p))
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
