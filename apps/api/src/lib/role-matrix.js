/**
 * Canonical default role ↔ permission matrix (Restaurant & Supplier workspaces).
 * Permission codes match DB tenant_role_permissions.permission (see permission-keys.js).
 */
import { PERMISSION_KEYS as P } from './permission-keys.js'
import { getWorkspaceViewPermissions } from './viewer-permissions.js'

/** Read-only: every workspace *_VIEW permission for the tenant type; zero writes. */
export const RESTAURANT_VIEWER = getWorkspaceViewPermissions('RESTAURANT')
export const SUPPLIER_VIEWER = getWorkspaceViewPermissions('SUPPLIER')

const RESTAURANT_ACCOUNTANT = [
  P.INVOICES_VIEW,
  P.INVOICES_CREATE,
  P.INVOICES_EDIT,
  P.INVOICES_MANAGE,
  P.PAYMENTS_VIEW,
  P.PAYMENTS_MANAGE,
  P.ORDERS_VIEW,
  P.SUBSCRIPTIONS_VIEW,
]

const SUPPLIER_ACCOUNTANT = [...RESTAURANT_ACCOUNTANT]

const DRIVER_DELIVERIES = [P.DRIVER_DELIVERIES_VIEW, P.DRIVER_DELIVERIES_MANAGE]

export const RESTAURANT_SYSTEM_ROLES = [
  {
    name: 'Owner',
    description: 'Main Admin — full access to all restaurant workspace features',
    permissions: 'ALL',
  },
  {
    name: 'Restaurant Manager',
    legacyNames: ['Manager'],
    description:
      'Daily operations: orders, receiving, disputes, catalog visibility; no billing/roles/team admin',
    permissions: [
      P.ORDERS_VIEW,
      P.ORDERS_CREATE,
      P.ORDERS_EDIT,
      P.ORDERS_MANAGE,
      P.RECEIVING_VIEW,
      P.RECEIVING_MANAGE,
      P.CATALOG_VIEW,
      P.INVENTORY_VIEW,
      P.INVOICES_VIEW,
      P.CHAT_VIEW,
      P.CHAT_SEND,
      P.SETTINGS_VIEW,
      P.RESERVATIONS_VIEW,
      P.RESERVATIONS_CREATE,
      P.RESERVATIONS_EDIT,
    ],
  },
  {
    name: 'Purchaser',
    legacyNames: ['Purchaser'],
    description: 'Browse suppliers, create and track orders',
    permissions: [
      P.ORDERS_VIEW,
      P.ORDERS_CREATE,
      P.ORDERS_EDIT,
      P.CATALOG_VIEW,
      P.INVENTORY_VIEW,
      P.CHAT_VIEW,
      P.CHAT_SEND,
    ],
  },
  {
    name: 'Receiving Staff',
    legacyNames: ['Inventory Clerk'],
    description: 'Receive deliveries and open receiving disputes; cannot create orders or billing',
    permissions: [P.ORDERS_VIEW, P.RECEIVING_VIEW, P.RECEIVING_MANAGE],
  },
  {
    name: 'Accountant',
    legacyNames: ['Accountant', 'Finance Staff'],
    description: 'Finance, invoices, payments, and billing views only',
    permissions: RESTAURANT_ACCOUNTANT,
  },
  {
    name: 'Viewer',
    legacyNames: ['Viewer', 'Read-only Staff'],
    description: 'Read-only — no create, edit, invite, or manage actions',
    permissions: RESTAURANT_VIEWER,
  },
  {
    name: 'FOH Staff',
    legacyNames: ['FOH Staff', 'Reservations/Host Staff'],
    description: 'Front-of-house reservations; no billing, users, or catalog admin',
    permissions: [P.RESERVATIONS_VIEW, P.RESERVATIONS_CREATE, P.RESERVATIONS_EDIT],
  },
]

export const SUPPLIER_SYSTEM_ROLES = [
  {
    name: 'Owner',
    description: 'Main Admin — full access to all supplier workspace features',
    permissions: 'ALL',
  },
  {
    name: 'Supplier Manager',
    legacyNames: ['Manager', 'Admin/Manager'],
    description:
      'Orders (accept/decline/fulfill), catalog, fulfillment; no billing/roles/team admin',
    permissions: [
      P.ORDERS_VIEW,
      P.ORDERS_EDIT,
      P.ORDERS_MANAGE,
      P.CATALOG_VIEW,
      P.CATALOG_EDIT,
      P.CATALOG_MANAGE,
      P.INVENTORY_VIEW,
      P.INVENTORY_EDIT,
      P.FULFILLMENT_VIEW,
      P.FULFILLMENT_MANAGE,
      P.WAREHOUSES_VIEW,
      P.INVOICES_VIEW,
      P.CHAT_VIEW,
      P.CHAT_SEND,
      P.SETTINGS_VIEW,
      P.PROMOTIONS_VIEW,
      P.GROWTH_VIEW,
      P.CUSTOMERS_IMPORT,
    ],
  },
  {
    name: 'Warehouse Manager',
    legacyNames: [],
    description:
      'Warehouses, fulfillment board, and delivery operations; no catalog import or billing',
    permissions: [
      P.FULFILLMENT_VIEW,
      P.FULFILLMENT_MANAGE,
      P.WAREHOUSES_VIEW,
      P.WAREHOUSES_EDIT,
      P.INVENTORY_VIEW,
      P.INVENTORY_EDIT,
      P.ORDERS_VIEW,
      P.RECEIVING_VIEW,
    ],
  },
  {
    name: 'Order Fulfillment Staff',
    legacyNames: ['Warehouse Staff', 'Fulfillment Staff'],
    description: 'Fulfillment and delivery board; cannot manage billing, catalog import, or team',
    permissions: [
      P.ORDERS_VIEW,
      P.ORDERS_EDIT,
      P.FULFILLMENT_VIEW,
      P.FULFILLMENT_MANAGE,
      P.INVENTORY_VIEW,
      P.WAREHOUSES_VIEW,
      P.RECEIVING_VIEW,
    ],
  },
  {
    name: 'Driver',
    legacyNames: [],
    description:
      'Assigned deliveries only — update status and proof; no catalog, billing, or settings',
    permissions: DRIVER_DELIVERIES,
  },
  {
    name: 'Catalog Manager',
    legacyNames: ['Catalog Manager', 'Catalog/Product Manager'],
    description: 'Products, catalog, pricing, import; no receivables or team admin',
    permissions: [
      P.CATALOG_VIEW,
      P.CATALOG_EDIT,
      P.CATALOG_MANAGE,
      P.INVENTORY_VIEW,
      P.INVENTORY_EDIT,
      P.ORDERS_VIEW,
    ],
  },
  {
    name: 'Promotions Manager',
    legacyNames: ['Sales Rep', 'Sales/Deals Manager'],
    description: 'Deals, promotions, and reorder intelligence; read-only order/catalog context',
    permissions: [
      P.PROMOTIONS_VIEW,
      P.PROMOTIONS_MANAGE,
      P.ORDERS_VIEW,
      P.ORDERS_MANAGE,
      P.CATALOG_VIEW,
    ],
  },
  {
    name: 'Accountant',
    legacyNames: ['Accountant', 'Finance Staff'],
    description: 'Finance, receivables, and billing only; cannot accept orders or import products',
    permissions: SUPPLIER_ACCOUNTANT,
  },
  {
    name: 'Viewer',
    legacyNames: ['Viewer', 'Read-only Staff'],
    description:
      'Read-only supplier workspace — orders, catalog, fulfillment, inventory, chat (view), settings (view); no mutations',
    permissions: SUPPLIER_VIEWER,
  },
]

export function allNamesForRoleDef(def) {
  return [def.name, ...(def.legacyNames || [])]
}
