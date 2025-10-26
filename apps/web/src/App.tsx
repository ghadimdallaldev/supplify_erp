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
import { RestaurantsPage } from './pages/RestaurantsPage'
import { RestaurantDetailPage } from './pages/RestaurantDetailPage'
import { SettingsPage } from './pages/SettingsPage'
import { CartPage } from './pages/CartPage'
import { ChatPage } from './pages/ChatPage'
import { FulfillmentPage } from './pages/FulfillmentPage'
import { InventoryPage } from './pages/InventoryPage'

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
        path: 'app/suppliers',
        element: <SuppliersPage />,
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
    ],
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
