import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ROUTER_FUTURE } from './lib/routerFuture'
import { AuthGuard } from './components/AuthGuard'
import { StaffPortalGuard } from './components/StaffPortalGuard'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { RegisterCompletePage } from './pages/RegisterCompletePage'
import { InviteAcceptPage } from './pages/InviteAcceptPage'
import { BranchInviteAcceptPage } from './pages/BranchInviteAcceptPage'
import { OAuthRedirect } from './components/OAuthRedirect'
import { PageLoading } from './components/ui/page-loading'

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((m) => ({ default: m.DashboardPage }))
)
const SupplierHome = lazy(() =>
  import('./pages/SupplierHome').then((m) => ({ default: m.SupplierHome }))
)
const ProductsPage = lazy(() =>
  import('./pages/ProductsPage').then((m) => ({ default: m.ProductsPage }))
)
const ProductDetailPage = lazy(() =>
  import('./pages/ProductDetailPage').then((m) => ({ default: m.ProductDetailPage }))
)
const OrdersPage = lazy(() => import('./pages/OrdersPage').then((m) => ({ default: m.OrdersPage })))
const OrderDetailPage = lazy(() =>
  import('./pages/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage }))
)
const SuppliersPage = lazy(() =>
  import('./pages/SuppliersPage').then((m) => ({ default: m.SuppliersPage }))
)
const SupplierDetailPage = lazy(() =>
  import('./pages/SupplierDetailPage').then((m) => ({ default: m.SupplierDetailPage }))
)
const RestaurantsPage = lazy(() =>
  import('./pages/RestaurantsPage').then((m) => ({ default: m.RestaurantsPage }))
)
const RestaurantDetailPage = lazy(() =>
  import('./pages/RestaurantDetailPage').then((m) => ({ default: m.RestaurantDetailPage }))
)
const SettingsPage = lazy(() =>
  import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage }))
)
const CartPage = lazy(() => import('./pages/CartPage').then((m) => ({ default: m.CartPage })))
const ChatPage = lazy(() => import('./pages/ChatPage').then((m) => ({ default: m.ChatPage })))
const FulfillmentPage = lazy(() =>
  import('./pages/FulfillmentPage').then((m) => ({ default: m.FulfillmentPage }))
)
const SupplierCommandCenterPage = lazy(() =>
  import('./pages/SupplierCommandCenterPage').then((m) => ({
    default: m.SupplierCommandCenterPage,
  }))
)
const DriverDeliveriesPage = lazy(() =>
  import('./pages/DriverDeliveriesPage').then((m) => ({
    default: m.DriverDeliveriesPage,
  }))
)
const InventoryPage = lazy(() =>
  import('./pages/InventoryPage').then((m) => ({ default: m.InventoryPage }))
)
const InvoicesPage = lazy(() =>
  import('./pages/InvoicesPage').then((m) => ({ default: m.InvoicesPage }))
)
const SupplierSettingsPage = lazy(() =>
  import('./pages/SupplierSettingsPage').then((m) => ({ default: m.SupplierSettingsPage }))
)
const QuickListsPage = lazy(() =>
  import('./pages/QuickListsPage').then((m) => ({ default: m.QuickListsPage }))
)
const RestaurantInventoryPage = lazy(() =>
  import('./pages/RestaurantInventoryPage').then((m) => ({ default: m.RestaurantInventoryPage }))
)
const RestaurantOnboardingPage = lazy(() =>
  import('./pages/RestaurantOnboardingPage').then((m) => ({ default: m.RestaurantOnboardingPage }))
)
const ReceivingPage = lazy(() =>
  import('./pages/ReceivingPage').then((m) => ({ default: m.ReceivingPage }))
)
const AdminDashboardPage = lazy(() =>
  import('./pages/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage }))
)
const ReservationsPage = lazy(() =>
  import('./pages/ReservationsPage').then((m) => ({ default: m.ReservationsPage }))
)
const StaffPage = lazy(() => import('./pages/StaffPage').then((m) => ({ default: m.StaffPage })))
const PublicReservationPortal = lazy(() =>
  import('./pages/PublicReservationPortal').then((m) => ({ default: m.PublicReservationPortal }))
)
const PublicReservationConfirmation = lazy(() =>
  import('./pages/PublicReservationConfirmation').then((m) => ({
    default: m.PublicReservationConfirmation,
  }))
)
const PublicReservationManage = lazy(() =>
  import('./pages/PublicReservationManage').then((m) => ({ default: m.PublicReservationManage }))
)
const PublicReservationWaitlistOffer = lazy(() =>
  import('./pages/PublicReservationWaitlistOffer').then((m) => ({
    default: m.PublicReservationWaitlistOffer,
  }))
)
const StaffSelfServiceLogin = lazy(() =>
  import('./pages/StaffSelfServiceLogin').then((m) => ({ default: m.StaffSelfServiceLogin }))
)
const StaffSelfServiceDashboard = lazy(() =>
  import('./pages/StaffSelfServiceDashboard').then((m) => ({
    default: m.StaffSelfServiceDashboard,
  }))
)
const AccountActivationPage = lazy(() =>
  import('./pages/AccountActivationPage').then((m) => ({ default: m.AccountActivationPage }))
)
const ReportsPage = lazy(() =>
  import('./pages/reports/ReportsPage').then((m) => ({ default: m.ReportsPage }))
)
const DisputesPage = lazy(() =>
  import('./pages/disputes/DisputesPage').then((m) => ({ default: m.DisputesPage }))
)
const DisputeDetailPage = lazy(() =>
  import('./pages/disputes/DisputeDetailPage').then((m) => ({ default: m.DisputeDetailPage }))
)
const PromotionsPage = lazy(() =>
  import('./pages/promotions/PromotionsPage').then((m) => ({ default: m.PromotionsPage }))
)
const ContractPricingPage = lazy(() =>
  import('./pages/ContractPricingPage').then((m) => ({ default: m.ContractPricingPage }))
)
const MyContractPricesPage = lazy(() =>
  import('./pages/MyContractPricesPage').then((m) => ({ default: m.MyContractPricesPage }))
)
const DealsPage = lazy(() =>
  import('./pages/deals/DealsPage').then((m) => ({ default: m.DealsPage }))
)
const OrgOverviewPage = lazy(() =>
  import('./pages/OrgOverviewPage').then((m) => ({ default: m.OrgOverviewPage }))
)
const BranchDetailPage = lazy(() =>
  import('./pages/BranchDetailPage').then((m) => ({ default: m.BranchDetailPage }))
)
const LegalHubPage = lazy(() =>
  import('./pages/LegalDocumentPage').then((m) => ({ default: m.LegalHubPage }))
)
const LegalDocumentPage = lazy(() =>
  import('./pages/LegalDocumentPage').then((m) => ({ default: m.LegalDocumentPage }))
)

function PageLoader() {
  return <PageLoading />
}

function LazyPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/auth/login',
    element: <OAuthRedirect flow="login" />,
  },
  {
    path: '/auth/register',
    element: <OAuthRedirect flow="register" />,
  },
  {
    path: '/reserve/confirmation',
    element: (
      <LazyPage>
        <PublicReservationConfirmation />
      </LazyPage>
    ),
  },
  {
    path: '/reserve/waitlist/:token/accept',
    element: (
      <LazyPage>
        <PublicReservationWaitlistOffer action="accept" />
      </LazyPage>
    ),
  },
  {
    path: '/reserve/waitlist/:token/decline',
    element: (
      <LazyPage>
        <PublicReservationWaitlistOffer action="decline" />
      </LazyPage>
    ),
  },
  {
    path: '/reserve/manage/:token',
    element: (
      <LazyPage>
        <PublicReservationManage />
      </LazyPage>
    ),
  },
  {
    path: '/reserve/:restaurantIdOrSlug',
    element: (
      <LazyPage>
        <PublicReservationPortal />
      </LazyPage>
    ),
  },
  {
    path: '/reserve',
    element: (
      <LazyPage>
        <PublicReservationPortal />
      </LazyPage>
    ),
  },
  {
    path: '/staff',
    element: (
      <LazyPage>
        <StaffSelfServiceLogin />
      </LazyPage>
    ),
  },
  {
    path: '/staff/login',
    element: (
      <LazyPage>
        <StaffSelfServiceLogin />
      </LazyPage>
    ),
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
    path: '/invite',
    element: <InviteAcceptPage />,
  },
  {
    path: '/legal',
    element: (
      <LazyPage>
        <LegalHubPage />
      </LazyPage>
    ),
  },
  {
    path: '/legal/:slug',
    element: (
      <LazyPage>
        <LegalDocumentPage />
      </LazyPage>
    ),
  },
  {
    path: '/staff/dashboard',
    element: (
      <LazyPage>
        <StaffPortalGuard>
          <StaffSelfServiceDashboard />
        </StaffPortalGuard>
      </LazyPage>
    ),
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
        element: (
          <LazyPage>
            <SupplierHome />
          </LazyPage>
        ),
      },
      {
        path: 'app',
        element: (
          <LazyPage>
            <SupplierHome />
          </LazyPage>
        ),
      },
      {
        path: 'app/dashboard',
        element: (
          <LazyPage>
            <DashboardPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/command-center',
        element: (
          <LazyPage>
            <SupplierCommandCenterPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/driver-deliveries',
        element: (
          <LazyPage>
            <DriverDeliveriesPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/activate',
        element: (
          <LazyPage>
            <AccountActivationPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/products',
        element: (
          <LazyPage>
            <ProductsPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/products/:id',
        element: (
          <LazyPage>
            <ProductDetailPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/orders',
        element: (
          <LazyPage>
            <OrdersPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/orders/:id',
        element: (
          <LazyPage>
            <OrderDetailPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/reports',
        element: (
          <LazyPage>
            <ReportsPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/disputes',
        element: (
          <LazyPage>
            <DisputesPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/disputes/:id',
        element: (
          <LazyPage>
            <DisputeDetailPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/promotions',
        element: (
          <LazyPage>
            <PromotionsPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/contract-pricing',
        element: (
          <LazyPage>
            <ContractPricingPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/my-prices',
        element: (
          <LazyPage>
            <MyContractPricesPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/deals',
        element: (
          <LazyPage>
            <DealsPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/cart',
        element: (
          <LazyPage>
            <CartPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/quick-lists',
        element: (
          <LazyPage>
            <QuickListsPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/restaurant-inventory',
        element: (
          <LazyPage>
            <RestaurantInventoryPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/onboarding',
        element: (
          <LazyPage>
            <RestaurantOnboardingPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/receiving',
        element: (
          <LazyPage>
            <ReceivingPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/reservations',
        element: (
          <LazyPage>
            <ReservationsPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/staff',
        element: (
          <LazyPage>
            <StaffPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/suppliers',
        element: (
          <LazyPage>
            <SuppliersPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/suppliers/:id',
        element: (
          <LazyPage>
            <SupplierDetailPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/restaurants',
        element: (
          <LazyPage>
            <RestaurantsPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/restaurants/:id',
        element: (
          <LazyPage>
            <RestaurantDetailPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/settings',
        element: (
          <LazyPage>
            <SettingsPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/org',
        element: (
          <LazyPage>
            <OrgOverviewPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/org/branches/:supplierId',
        element: (
          <LazyPage>
            <BranchDetailPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/chat',
        element: (
          <LazyPage>
            <ChatPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/fulfillment',
        element: (
          <LazyPage>
            <FulfillmentPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/inventory',
        element: (
          <LazyPage>
            <InventoryPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/invoices',
        element: (
          <LazyPage>
            <InvoicesPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/supplier-settings',
        element: (
          <LazyPage>
            <SupplierSettingsPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/admin',
        element: (
          <LazyPage>
            <AdminDashboardPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/admin/suppliers',
        element: (
          <LazyPage>
            <AdminDashboardPage initialTab="suppliers" />
          </LazyPage>
        ),
      },
      {
        path: 'app/admin/restaurants',
        element: (
          <LazyPage>
            <AdminDashboardPage initialTab="restaurants" />
          </LazyPage>
        ),
      },
    ],
  },
])

export function App() {
  return <RouterProvider router={router} future={ROUTER_FUTURE} />
}

export default App
