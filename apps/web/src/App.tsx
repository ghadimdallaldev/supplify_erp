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
import { ReservationsPage } from './pages/ReservationsPage'
import { StaffPage } from './pages/StaffPage'
import { PublicReservationPortal } from './pages/PublicReservationPortal'
import { PublicReservationConfirmation } from './pages/PublicReservationConfirmation'
import { PublicReservationManage } from './pages/PublicReservationManage'
import { StaffSelfServiceLogin } from './pages/StaffSelfServiceLogin'
import { StaffSelfServiceDashboard } from './pages/StaffSelfServiceDashboard'
import { RegisterCompletePage } from './pages/RegisterCompletePage'
import { AccountActivationPage } from './pages/AccountActivationPage'
import { ApprovalsPage } from './pages/approvals/ApprovalsPage'
import { ReportsPage } from './pages/reports/ReportsPage'
import { DisputesPage } from './pages/disputes/DisputesPage'
import { PromotionsPage } from './pages/promotions/PromotionsPage'
import { DealsPage } from './pages/deals/DealsPage'
import { OrgOverviewPage } from './pages/OrgOverviewPage'
import { BranchDetailPage } from './pages/BranchDetailPage'
import { BranchInviteAcceptPage } from './pages/BranchInviteAcceptPage'

const router = createBrowserRouter(
  [
    {
      path: '/login',
      element: <LoginPage />,
    },
    {
      path: '/reserve/confirmation',
      element: <PublicReservationConfirmation />,
    },
    {
      path: '/reserve/manage/:token',
      element: <PublicReservationManage />,
    },
    {
      path: '/reserve/:restaurantIdOrSlug',
      element: <PublicReservationPortal />,
    },
    {
      path: '/reserve',
      element: <PublicReservationPortal />,
    },
    {
      path: '/staff',
      element: <StaffSelfServiceLogin />,
    },
    {
      path: '/register/complete',
      element: <RegisterCompletePage />,
    },
    {
      path: '/invite/branch',
      element: <BranchInviteAcceptPage />,
    },
    {
      path: '/staff/dashboard',
      element: <StaffSelfServiceDashboard />,
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
          path: 'app/activate',
          element: <AccountActivationPage />,
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
          path: 'app/approvals',
          element: <ApprovalsPage />,
        },
        {
          path: 'app/reports',
          element: <ReportsPage />,
        },
        {
          path: 'app/disputes',
          element: <DisputesPage />,
        },
        {
          path: 'app/promotions',
          element: <PromotionsPage />,
        },
        {
          path: 'app/deals',
          element: <DealsPage />,
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
          path: 'app/reservations',
          element: <ReservationsPage />,
        },
        {
          path: 'app/staff',
          element: <StaffPage />,
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
          path: 'app/org',
          element: <OrgOverviewPage />,
        },
        {
          path: 'app/org/branches/:supplierId',
          element: <BranchDetailPage />,
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
        {
          path: 'app/admin/suppliers',
          element: <AdminDashboardPage initialTab="suppliers" />,
        },
        {
          path: 'app/admin/restaurants',
          element: <AdminDashboardPage initialTab="restaurants" />,
        },
      ],
    },
  ],
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true,
    },
  }
)

export function App() {
  return <RouterProvider router={router} />
}

export default App
