import { test as base } from '@playwright/test'

import { baseURL } from '../utils/env'

import { LoginPage } from '../pages/LoginPage'

import { AppDashboardPage } from '../pages/DashboardPage'

import { OrdersPage } from '../pages/OrdersPage'

import { CartPage } from '../pages/CartPage'

import { ProductsPage } from '../pages/ProductsPage'

import { AdminDashboardPage } from '../pages/AdminDashboardPage'

import { ReceivingPage } from '../pages/ReceivingPage'

import { FulfillmentPage } from '../pages/FulfillmentPage'

import { OrderDetailPage } from '../pages/OrderDetailPage'

import { InvoicesPage } from '../pages/InvoicesPage'

import { SettingsPage } from '../pages/SettingsPage'

import { DealsPage } from '../pages/DealsPage'

import { PromotionsPage } from '../pages/PromotionsPage'

import { QuotesPage } from '../pages/QuotesPage'

import { ContractPricingPage } from '../pages/ContractPricingPage'

import { InventoryPage } from '../pages/InventoryPage'

import { ChatPage } from '../pages/ChatPage'

import { ReservationsPage } from '../pages/ReservationsPage'

import { StaffPage } from '../pages/StaffPage'

import { DriverDeliveriesPage } from '../pages/DriverDeliveriesPage'

type PageFixtures = {
  authStub: void

  loginPage: LoginPage

  dashboardPage: AppDashboardPage

  ordersPage: OrdersPage

  cartPage: CartPage

  productsPage: ProductsPage

  adminDashboardPage: AdminDashboardPage

  receivingPage: ReceivingPage

  fulfillmentPage: FulfillmentPage

  orderDetailPage: OrderDetailPage

  invoicesPage: InvoicesPage

  settingsPage: SettingsPage

  dealsPage: DealsPage

  promotionsPage: PromotionsPage

  quotesPage: QuotesPage

  contractPricingPage: ContractPricingPage

  inventoryPage: InventoryPage

  chatPage: ChatPage

  reservationsPage: ReservationsPage

  staffPage: StaffPage

  driverDeliveriesPage: DriverDeliveriesPage
}

function roleFromProjectName(projectName: string): 'ADMIN' | 'RESTAURANT' | 'SUPPLIER' {
  if (projectName.includes('admin')) return 'ADMIN'

  if (projectName.includes('supplier')) return 'SUPPLIER'

  return 'RESTAURANT'
}

/** Explicit permissions per role for E2E AUTH MODE. Must match API RBAC expectations. */

const E2E_AUTH_PAYLOADS: Record<
  'ADMIN' | 'RESTAURANT' | 'SUPPLIER',
  {
    tenantRoles: string[]

    tenantPermissions: string[]

    adminRoles: string[]

    adminPermissions: string[]

    displayName: string

    email: string
  }
> = {
  RESTAURANT: {
    tenantRoles: ['restaurant_manager'],

    tenantPermissions: [
      'ORDERS_VIEW',

      'ORDERS_CREATE',

      'ORDERS_EDIT',

      'CATALOG_VIEW',

      'SETTINGS_VIEW',

      'CHAT_VIEW',

      'CHAT_SEND',
    ],

    adminRoles: [],

    adminPermissions: [],

    displayName: 'Restaurant 1',

    email: 'restaurant-1@test.com',
  },

  SUPPLIER: {
    tenantRoles: ['supplier'],

    tenantPermissions: [
      'ORDERS_VIEW',

      'ORDERS_EDIT',

      'ORDERS_MANAGE',

      'CATALOG_VIEW',

      'SETTINGS_VIEW',

      'CHAT_VIEW',

      'CHAT_SEND',
    ],

    adminRoles: [],

    adminPermissions: [],

    displayName: 'Supplier Contact',

    email: 'contact-0@supplier0.test',
  },

  ADMIN: {
    tenantRoles: [],

    tenantPermissions: [],

    adminRoles: ['admin'],

    adminPermissions: [
      'ADMIN_ACCESS',

      'ADMIN_TENANTS',

      'ADMIN_PLANS',

      'ADMIN_SUPPORT',

      'ADMIN_FINANCE',

      'ADMIN_GROWTH',
    ],

    displayName: 'Admin',

    email: 'admin@supplify.com',
  },
}

let e2eAuthRoleLogged = false

function logE2EAuthRoleOnce(
  role: 'ADMIN' | 'RESTAURANT' | 'SUPPLIER',

  payload: (typeof E2E_AUTH_PAYLOADS)['ADMIN']
): void {
  if (e2eAuthRoleLogged) return

  e2eAuthRoleLogged = true

  const perms = role === 'ADMIN' ? payload.adminPermissions : payload.tenantPermissions

  // eslint-disable-next-line no-console

  console.log(
    '[E2E AUTH MODE] effective role:',

    role,

    '| permissions:',

    perms?.slice(0, 10).join(', ') + (perms && perms.length > 10 ? '...' : '')
  )
}

export const test = base.extend<PageFixtures>({
  authStub: async ({ page }, use, testInfo) => {
    // Hosted HTTPS (app-dev): use real Keycloak session + /auth/me. Local stubs stay for offline/dev.

    const useRealAuth = baseURL.startsWith('https://') || process.env.E2E_REAL_AUTH === '1'

    if (useRealAuth) {
      await use()

      return
    }

    const role = roleFromProjectName(testInfo.project.name)

    const payload = E2E_AUTH_PAYLOADS[role]

    if (role !== 'ADMIN') {
      if (!payload.tenantPermissions?.length) {
        throw new Error(
          'E2E auth stub: tenantPermissions must be non-empty for RESTAURANT/SUPPLIER. Fix E2E_AUTH_PAYLOADS.'
        )
      }
    } else {
      if (!payload.adminPermissions?.length) {
        throw new Error(
          'E2E auth stub: adminPermissions must be non-empty for ADMIN. Fix E2E_AUTH_PAYLOADS.'
        )
      }
    }

    logE2EAuthRoleOnce(role, payload)

    await page.route('**/auth/me', (route) => {
      const request = route.request()

      if (request.method() !== 'GET') {
        route.continue()

        return
      }

      route.fulfill({
        status: 200,

        contentType: 'application/json',

        body: JSON.stringify({
          ok: true,

          data: {
            id: 'e2e-user',

            email: payload.email,

            displayName: payload.displayName,

            role,

            tenantRoles: payload.tenantRoles,

            tenantPermissions: payload.tenantPermissions,

            adminRoles: payload.adminRoles,

            adminPermissions: payload.adminPermissions,
          },

          error: null,
        }),
      })
    })

    await use()
  },

  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page, baseURL))
  },

  dashboardPage: async ({ page, authStub }, use) => {
    await use(new AppDashboardPage(page, baseURL))
  },

  ordersPage: async ({ page, authStub }, use) => {
    await use(new OrdersPage(page, baseURL))
  },

  cartPage: async ({ page, authStub }, use) => {
    await use(new CartPage(page, baseURL))
  },

  productsPage: async ({ page, authStub }, use) => {
    await use(new ProductsPage(page, baseURL))
  },

  adminDashboardPage: async ({ page, authStub }, use) => {
    await use(new AdminDashboardPage(page, baseURL))
  },

  receivingPage: async ({ page, authStub }, use) => {
    await use(new ReceivingPage(page, baseURL))
  },

  fulfillmentPage: async ({ page, authStub }, use) => {
    await use(new FulfillmentPage(page, baseURL))
  },

  orderDetailPage: async ({ page, authStub }, use) => {
    await use(new OrderDetailPage(page, baseURL))
  },

  invoicesPage: async ({ page, authStub }, use) => {
    await use(new InvoicesPage(page, baseURL))
  },

  settingsPage: async ({ page, authStub }, use) => {
    await use(new SettingsPage(page, baseURL))
  },

  dealsPage: async ({ page, authStub }, use) => {
    await use(new DealsPage(page, baseURL))
  },

  promotionsPage: async ({ page, authStub }, use) => {
    await use(new PromotionsPage(page, baseURL))
  },

  quotesPage: async ({ page, authStub }, use) => {
    await use(new QuotesPage(page, baseURL))
  },

  contractPricingPage: async ({ page, authStub }, use) => {
    await use(new ContractPricingPage(page, baseURL))
  },

  inventoryPage: async ({ page, authStub }, use) => {
    await use(new InventoryPage(page, baseURL))
  },

  chatPage: async ({ page, authStub }, use) => {
    await use(new ChatPage(page, baseURL))
  },

  reservationsPage: async ({ page, authStub }, use) => {
    await use(new ReservationsPage(page, baseURL))
  },

  staffPage: async ({ page, authStub }, use) => {
    await use(new StaffPage(page, baseURL))
  },

  driverDeliveriesPage: async ({ page, authStub }, use) => {
    await use(new DriverDeliveriesPage(page, baseURL))
  },
})

export { expect } from '@playwright/test'
