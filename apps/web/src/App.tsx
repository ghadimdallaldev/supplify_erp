import { lazy, Suspense, type ReactNode } from 'react'
import {
  createBrowserRouter,
  RouterProvider,
  Outlet,
  useParams,
  useLocation,
} from 'react-router-dom'
import { ROUTER_FUTURE } from './lib/routerFuture'
import { ConsumerAuthProvider } from './contexts/ConsumerAuthContext'
import { ConsumerShell } from './components/consumer/ConsumerShell'
import { AuthGuard } from './components/AuthGuard'
import { StaffPortalGuard } from './components/StaffPortalGuard'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { RegisterCompletePage } from './pages/RegisterCompletePage'
import { LegalReacceptPage } from './pages/LegalReacceptPage'
import { InviteAcceptPage } from './pages/InviteAcceptPage'
import { BranchInviteAcceptPage } from './pages/BranchInviteAcceptPage'
import { OAuthRedirect } from './components/OAuthRedirect'
import { PageLoading } from './components/ui/page-loading'
import { RequirePermission } from './components/RequirePermission'

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
const SupplierCustomerGrowthPage = lazy(() =>
  import('./pages/SupplierCustomerGrowthPage').then((m) => ({
    default: m.SupplierCustomerGrowthPage,
  }))
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
const LoyaltyProgramPage = lazy(() =>
  import('./pages/loyalty/LoyaltyProgramPage').then((m) => ({ default: m.LoyaltyProgramPage }))
)
const ConsumerLoyaltyPage = lazy(() =>
  import('./pages/loyalty/ConsumerLoyaltyPage').then((m) => ({ default: m.ConsumerLoyaltyPage }))
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
const PublicSupplierCatalogPage = lazy(() =>
  import('./pages/PublicSupplierCatalogPage').then((m) => ({
    default: m.PublicSupplierCatalogPage,
  }))
)
const QuoteRequestsPage = lazy(() =>
  import('./pages/QuoteRequestsPage').then((m) => ({ default: m.QuoteRequestsPage }))
)
const QuoteRequestDetailPage = lazy(() =>
  import('./pages/QuoteRequestDetailPage').then((m) => ({ default: m.QuoteRequestDetailPage }))
)
const CreateQuoteRequestPage = lazy(() =>
  import('./pages/CreateQuoteRequestPage').then((m) => ({ default: m.CreateQuoteRequestPage }))
)
const SupplierQuoteInboxPage = lazy(() =>
  import('./pages/SupplierQuoteInboxPage').then((m) => ({ default: m.SupplierQuoteInboxPage }))
)
const SupplierQuoteResponsePage = lazy(() =>
  import('./pages/SupplierQuoteResponsePage').then((m) => ({
    default: m.SupplierQuoteResponsePage,
  }))
)
const ConsumerStorefrontPage = lazy(() =>
  import('./pages/consumer/ConsumerStorefrontPage').then((m) => ({
    default: m.ConsumerStorefrontPage,
  }))
)
const ConsumerMenuPage = lazy(() =>
  import('./pages/consumer/ConsumerMenuPage').then((m) => ({ default: m.ConsumerMenuPage }))
)
const ConsumerCheckoutPage = lazy(() =>
  import('./pages/consumer/ConsumerCheckoutPage').then((m) => ({
    default: m.ConsumerCheckoutPage,
  }))
)
const ConsumerReceiptPage = lazy(() =>
  import('./pages/consumer/ConsumerReceiptPage').then((m) => ({ default: m.ConsumerReceiptPage }))
)
const ConsumerTrackOrderPage = lazy(() =>
  import('./pages/consumer/ConsumerTrackOrderPage').then((m) => ({
    default: m.ConsumerTrackOrderPage,
  }))
)
const MenuAdminPage = lazy(() =>
  import('./pages/consumer/MenuAdminPage').then((m) => ({ default: m.MenuAdminPage }))
)
const ConsumerOrdersPage = lazy(() =>
  import('./pages/consumer/ConsumerOrdersPage').then((m) => ({ default: m.ConsumerOrdersPage }))
)
const ConsumerAccountPage = lazy(() =>
  import('./pages/consumer/ConsumerAccountPage').then((m) => ({ default: m.ConsumerAccountPage }))
)
const ConsumerRewardsPage = lazy(() =>
  import('./pages/consumer/ConsumerRewardsPage').then((m) => ({ default: m.ConsumerRewardsPage }))
)

function ConsumerRouteLayout() {
  const { restaurantSlug } = useParams<{ restaurantSlug: string }>()
  const location = useLocation()
  const showBranchPicker =
    location.pathname.includes('/menu') || location.pathname.includes('/checkout')
  return (
    <ConsumerAuthProvider restaurantSlug={restaurantSlug ?? ''}>
      <ConsumerShell slug={restaurantSlug ?? ''} showBranchPicker={showBranchPicker}>
        <Outlet />
      </ConsumerShell>
    </ConsumerAuthProvider>
  )
}

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
    path: '/register',
    element: <RegisterPage />,
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
    path: '/supplier/:idOrSlug',
    element: (
      <LazyPage>
        <PublicSupplierCatalogPage />
      </LazyPage>
    ),
  },
  {
    path: '/order/:restaurantSlug',
    element: <ConsumerRouteLayout />,
    children: [
      {
        index: true,
        element: (
          <LazyPage>
            <ConsumerStorefrontPage />
          </LazyPage>
        ),
      },
      {
        path: 'menu',
        element: (
          <LazyPage>
            <ConsumerMenuPage />
          </LazyPage>
        ),
      },
      {
        path: 'checkout',
        element: (
          <LazyPage>
            <ConsumerCheckoutPage />
          </LazyPage>
        ),
      },
      {
        path: 'receipt/:receiptToken',
        element: (
          <LazyPage>
            <ConsumerReceiptPage />
          </LazyPage>
        ),
      },
      {
        path: 'track',
        element: (
          <LazyPage>
            <ConsumerTrackOrderPage />
          </LazyPage>
        ),
      },
      {
        path: 'account',
        element: (
          <LazyPage>
            <ConsumerAccountPage />
          </LazyPage>
        ),
      },
      {
        path: 'rewards',
        element: (
          <LazyPage>
            <ConsumerRewardsPage />
          </LazyPage>
        ),
      },
    ],
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
    path: '/legal/reaccept',
    element: <LegalReacceptPage />,
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
        path: 'app/customer-growth',
        element: (
          <LazyPage>
            <RequirePermission anyOf={['GROWTH_VIEW']} allowOwner title="customer growth">
              <SupplierCustomerGrowthPage />
            </RequirePermission>
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
        path: 'app/loyalty',
        element: (
          <LazyPage>
            <LoyaltyProgramPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/consumer-loyalty',
        element: (
          <LazyPage>
            <ConsumerLoyaltyPage />
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
        path: 'app/consumer-menu',
        element: (
          <LazyPage>
            <MenuAdminPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/consumer-orders',
        element: (
          <LazyPage>
            <ConsumerOrdersPage />
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
        path: 'app/quote-requests',
        element: (
          <LazyPage>
            <QuoteRequestsPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/quote-requests/new',
        element: (
          <LazyPage>
            <CreateQuoteRequestPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/quote-requests/supplier',
        element: (
          <LazyPage>
            <SupplierQuoteInboxPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/quote-requests/supplier/:quoteRequestSupplierId',
        element: (
          <LazyPage>
            <SupplierQuoteResponsePage />
          </LazyPage>
        ),
      },
      {
        path: 'app/quote-requests/:id',
        element: (
          <LazyPage>
            <QuoteRequestDetailPage />
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
        path: 'app/admin/restaurants/:tab',
        element: (
          <LazyPage>
            <AdminDashboardPage initialTab="restaurants" />
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
      {
        path: 'app/admin/suppliers/:tab',
        element: (
          <LazyPage>
            <AdminDashboardPage initialTab="suppliers" />
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
        path: 'app/admin/:tab',
        element: (
          <LazyPage>
            <AdminDashboardPage />
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
    ],
  },
])

export function App() {
  return <RouterProvider router={router} future={ROUTER_FUTURE} />
}

export default App
