import { test as base } from '@playwright/test'
import { baseURL } from '../utils/env'
import { LoginPage } from '../pages/LoginPage'
import { AppDashboardPage } from '../pages/DashboardPage'
import { OrdersPage } from '../pages/OrdersPage'
import { CartPage } from '../pages/CartPage'
import { ProductsPage } from '../pages/ProductsPage'
import { AdminDashboardPage } from '../pages/AdminDashboardPage'

type PageFixtures = {
  loginPage: LoginPage
  dashboardPage: AppDashboardPage
  ordersPage: OrdersPage
  cartPage: CartPage
  productsPage: ProductsPage
  adminDashboardPage: AdminDashboardPage
}

export const test = base.extend<PageFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page, baseURL))
  },
  dashboardPage: async ({ page }, use) => {
    await use(new AppDashboardPage(page, baseURL))
  },
  ordersPage: async ({ page }, use) => {
    await use(new OrdersPage(page, baseURL))
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page, baseURL))
  },
  productsPage: async ({ page }, use) => {
    await use(new ProductsPage(page, baseURL))
  },
  adminDashboardPage: async ({ page }, use) => {
    await use(new AdminDashboardPage(page, baseURL))
  },
})

export { expect } from '@playwright/test'
