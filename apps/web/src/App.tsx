import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AuthGuard } from './components/AuthGuard'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProductsPage } from './pages/ProductsPage'
import { ProductDetailPage } from './pages/ProductDetailPage'
import { OrdersPage } from './pages/OrdersPage'
import { OrderDetailPage } from './pages/OrderDetailPage'
import { SuppliersPage } from './pages/SuppliersPage'
import { SupplierDetailPage } from './pages/SupplierDetailPage'
import { RestaurantsPage } from './pages/RestaurantsPage'
import { RestaurantDetailPage } from './pages/RestaurantDetailPage'
import { SettingsPage } from './pages/SettingsPage'
import { CartPage } from './pages/CartPage'
import { ChatPage } from './pages/ChatPage'
import { FulfillmentPage } from './pages/FulfillmentPage'
import { InventoryPage } from './pages/InventoryPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { SupplierSettingsPage } from './pages/SupplierSettingsPage'
import { QuickListsPage } from './pages/QuickListsPage'
import { RestaurantInventoryPage } from './pages/RestaurantInventoryPage'
import { RestaurantOnboardingPage } from './pages/RestaurantOnboardingPage'
import { ReceivingPage } from './pages/ReceivingPage'
import { AdminDashboardPage } from './pages/AdminDashboardPage'

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <Layout />
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        element: <DashboardPage />,
      },
      {
        path: 'app',
        element: <DashboardPage />,
      },
      {
        path: 'app/dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'app/products',
        element: <ProductsPage />,
      },
      {
        path: 'app/products/:id',
        element: <ProductDetailPage />,
      },
      {
        path: 'app/orders',
        element: <OrdersPage />,
      },
      {
        path: 'app/orders/:id',
        element: <OrderDetailPage />,
      },
      {
        path: 'app/cart',
        element: <CartPage />,
      },
      {
        path: 'app/quick-lists',
        element: <QuickListsPage />,
      },
      {
        path: 'app/restaurant-inventory',
        element: <RestaurantInventoryPage />,
      },
      {
        path: 'app/onboarding',
        element: <RestaurantOnboardingPage />,
      },
      {
        path: 'app/receiving',
        element: <ReceivingPage />,
      },
      {
        path: 'app/suppliers',
        element: <SuppliersPage />,
      },
      {
        path: 'app/suppliers/:id',
        element: <SupplierDetailPage />,
      },
      {
        path: 'app/restaurants',
        element: <RestaurantsPage />,
      },
      {
        path: 'app/restaurants/:id',
        element: <RestaurantDetailPage />,
      },
      {
        path: 'app/settings',
        element: <SettingsPage />,
      },
      {
        path: 'app/chat',
        element: <ChatPage />,
      },
      {
        path: 'app/fulfillment',
        element: <FulfillmentPage />,
      },
      {
        path: 'app/inventory',
        element: <InventoryPage />,
      },
      {
        path: 'app/invoices',
        element: <InvoicesPage />,
      },
      {
        path: 'app/supplier-settings',
        element: <SupplierSettingsPage />,
      },
      {
        path: 'app/admin',
        element: <AdminDashboardPage />,
      },
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
