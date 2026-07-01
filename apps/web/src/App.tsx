import { Suspense, type ReactNode } from 'react'
import { lazyNamedPage } from './i18n/lazyPage'
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
import { CustomDomainCatalogHost } from './components/public/CustomDomainCatalogHost'
import { RequirePermission } from './components/RequirePermission'

const DashboardPage = lazyNamedPage(() => import('./pages/DashboardPage'), 'DashboardPage')
const SupplierHome = lazyNamedPage(() => import('./pages/SupplierHome'), 'SupplierHome')
const ProductsPage = lazyNamedPage(() => import('./pages/ProductsPage'), 'ProductsPage')
const ProductDetailPage = lazyNamedPage(
  () => import('./pages/ProductDetailPage'),
  'ProductDetailPage'
)
const OrdersPage = lazyNamedPage(() => import('./pages/OrdersPage'), 'OrdersPage')
const OrderDetailPage = lazyNamedPage(() => import('./pages/OrderDetailPage'), 'OrderDetailPage')
const SuppliersPage = lazyNamedPage(() => import('./pages/SuppliersPage'), 'SuppliersPage')
const SupplierDetailPage = lazyNamedPage(
  () => import('./pages/SupplierDetailPage'),
  'SupplierDetailPage'
)
const RestaurantsPage = lazyNamedPage(() => import('./pages/RestaurantsPage'), 'RestaurantsPage')
const RestaurantDetailPage = lazyNamedPage(
  () => import('./pages/RestaurantDetailPage'),
  'RestaurantDetailPage'
)
const SettingsPage = lazyNamedPage(() => import('./pages/SettingsPage'), 'SettingsPage')
const CartPage = lazyNamedPage(() => import('./pages/CartPage'), 'CartPage')
const ChatPage = lazyNamedPage(() => import('./pages/ChatPage'), 'ChatPage')
const FulfillmentPage = lazyNamedPage(() => import('./pages/FulfillmentPage'), 'FulfillmentPage')
const SupplierCommandCenterPage = lazyNamedPage(
  () => import('./pages/SupplierCommandCenterPage'),
  'SupplierCommandCenterPage'
)
const SupplierRunSheetPage = lazyNamedPage(
  () => import('./pages/SupplierRunSheetPage'),
  'SupplierRunSheetPage'
)
const DriverDeliveriesPage = lazyNamedPage(
  () => import('./pages/DriverDeliveriesPage'),
  'DriverDeliveriesPage'
)
const InventoryPage = lazyNamedPage(() => import('./pages/InventoryPage'), 'InventoryPage')
const InvoicesPage = lazyNamedPage(() => import('./pages/InvoicesPage'), 'InvoicesPage')
const SupplierSettingsPage = lazyNamedPage(
  () => import('./pages/SupplierSettingsPage'),
  'SupplierSettingsPage'
)
const QuickListsPage = lazyNamedPage(() => import('./pages/QuickListsPage'), 'QuickListsPage')
const RestaurantInventoryPage = lazyNamedPage(
  () => import('./pages/RestaurantInventoryPage'),
  'RestaurantInventoryPage'
)
const RestaurantOnboardingPage = lazyNamedPage(
  () => import('./pages/RestaurantOnboardingPage'),
  'RestaurantOnboardingPage'
)
const ReceivingPage = lazyNamedPage(() => import('./pages/ReceivingPage'), 'ReceivingPage')
const RecipesListPage = lazyNamedPage(
  () => import('./pages/recipes/RecipesListPage'),
  'RecipesListPage'
)
const RecipeBuilderPage = lazyNamedPage(
  () => import('./pages/recipes/RecipeBuilderPage'),
  'RecipeBuilderPage'
)
const RecipeDetailPage = lazyNamedPage(
  () => import('./pages/recipes/RecipeDetailPage'),
  'RecipeDetailPage'
)
const RecipeCostingDashboardPage = lazyNamedPage(
  () => import('./pages/recipes/RecipeCostingDashboardPage'),
  'RecipeCostingDashboardPage'
)
const RecipePriceImpactPage = lazyNamedPage(
  () => import('./pages/recipes/RecipePriceImpactPage'),
  'RecipePriceImpactPage'
)
const SupplierCustomerGrowthPage = lazyNamedPage(
  () => import('./pages/SupplierCustomerGrowthPage'),
  'SupplierCustomerGrowthPage'
)
const AdminDashboardPage = lazyNamedPage(
  () => import('./pages/AdminDashboardPage'),
  'AdminDashboardPage'
)
const ReservationsPage = lazyNamedPage(() => import('./pages/ReservationsPage'), 'ReservationsPage')
const StaffPage = lazyNamedPage(() => import('./pages/StaffPage'), 'StaffPage')
const PublicReservationPortal = lazyNamedPage(
  () => import('./pages/PublicReservationPortal'),
  'PublicReservationPortal'
)
const PublicReservationConfirmation = lazyNamedPage(
  () => import('./pages/PublicReservationConfirmation'),
  'PublicReservationConfirmation'
)
const PublicReservationManage = lazyNamedPage(
  () => import('./pages/PublicReservationManage'),
  'PublicReservationManage'
)
const PublicReservationWaitlistOffer = lazyNamedPage(
  () => import('./pages/PublicReservationWaitlistOffer'),
  'PublicReservationWaitlistOffer'
)
const StaffSelfServiceLogin = lazyNamedPage(
  () => import('./pages/StaffSelfServiceLogin'),
  'StaffSelfServiceLogin'
)
const StaffSelfServiceDashboard = lazyNamedPage(
  () => import('./pages/StaffSelfServiceDashboard'),
  'StaffSelfServiceDashboard'
)
const AccountActivationPage = lazyNamedPage(
  () => import('./pages/AccountActivationPage'),
  'AccountActivationPage'
)
const ReportsPage = lazyNamedPage(() => import('./pages/reports/ReportsPage'), 'ReportsPage')
const DisputesPage = lazyNamedPage(() => import('./pages/disputes/DisputesPage'), 'DisputesPage')
const DisputeDetailPage = lazyNamedPage(
  () => import('./pages/disputes/DisputeDetailPage'),
  'DisputeDetailPage'
)
const PromotionsPage = lazyNamedPage(
  () => import('./pages/promotions/PromotionsPage'),
  'PromotionsPage'
)
const ContractPricingPage = lazyNamedPage(
  () => import('./pages/ContractPricingPage'),
  'ContractPricingPage'
)
const MyContractPricesPage = lazyNamedPage(
  () => import('./pages/MyContractPricesPage'),
  'MyContractPricesPage'
)
const DealsPage = lazyNamedPage(() => import('./pages/deals/DealsPage'), 'DealsPage')
const LoyaltyProgramPage = lazyNamedPage(
  () => import('./pages/loyalty/LoyaltyProgramPage'),
  'LoyaltyProgramPage'
)
const ConsumerLoyaltyPage = lazyNamedPage(
  () => import('./pages/loyalty/ConsumerLoyaltyPage'),
  'ConsumerLoyaltyPage'
)
const OrgOverviewPage = lazyNamedPage(() => import('./pages/OrgOverviewPage'), 'OrgOverviewPage')
const BranchDetailPage = lazyNamedPage(() => import('./pages/BranchDetailPage'), 'BranchDetailPage')
const LegalHubPage = lazyNamedPage(() => import('./pages/LegalDocumentPage'), 'LegalHubPage')
const LegalDocumentPage = lazyNamedPage(
  () => import('./pages/LegalDocumentPage'),
  'LegalDocumentPage'
)
const PublicSupplierCatalogPage = lazyNamedPage(
  () => import('./pages/PublicSupplierCatalogPage'),
  'PublicSupplierCatalogPage'
)
const QuoteRequestsPage = lazyNamedPage(
  () => import('./pages/QuoteRequestsPage'),
  'QuoteRequestsPage'
)
const QuoteRequestDetailPage = lazyNamedPage(
  () => import('./pages/QuoteRequestDetailPage'),
  'QuoteRequestDetailPage'
)
const CreateQuoteRequestPage = lazyNamedPage(
  () => import('./pages/CreateQuoteRequestPage'),
  'CreateQuoteRequestPage'
)
const SupplierQuoteInboxPage = lazyNamedPage(
  () => import('./pages/SupplierQuoteInboxPage'),
  'SupplierQuoteInboxPage'
)
const SupplierQuoteResponsePage = lazyNamedPage(
  () => import('./pages/SupplierQuoteResponsePage'),
  'SupplierQuoteResponsePage'
)
const ConsumerStorefrontPage = lazyNamedPage(
  () => import('./pages/consumer/ConsumerStorefrontPage'),
  'ConsumerStorefrontPage'
)
const ConsumerMenuPage = lazyNamedPage(
  () => import('./pages/consumer/ConsumerMenuPage'),
  'ConsumerMenuPage'
)
const ConsumerCheckoutPage = lazyNamedPage(
  () => import('./pages/consumer/ConsumerCheckoutPage'),
  'ConsumerCheckoutPage'
)
const ConsumerReceiptPage = lazyNamedPage(
  () => import('./pages/consumer/ConsumerReceiptPage'),
  'ConsumerReceiptPage'
)
const ConsumerTrackOrderPage = lazyNamedPage(
  () => import('./pages/consumer/ConsumerTrackOrderPage'),
  'ConsumerTrackOrderPage'
)
const MenuAdminPage = lazyNamedPage(() => import('./pages/consumer/MenuAdminPage'), 'MenuAdminPage')
const ConsumerOrdersPage = lazyNamedPage(
  () => import('./pages/consumer/ConsumerOrdersPage'),
  'ConsumerOrdersPage'
)
const ConsumerAccountPage = lazyNamedPage(
  () => import('./pages/consumer/ConsumerAccountPage'),
  'ConsumerAccountPage'
)
const ConsumerRewardsPage = lazyNamedPage(
  () => import('./pages/consumer/ConsumerRewardsPage'),
  'ConsumerRewardsPage'
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
        path: 'app/run-sheet',
        element: (
          <LazyPage>
            <SupplierRunSheetPage />
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
        path: 'app/recipes',
        element: (
          <LazyPage>
            <RecipesListPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/recipes/new',
        element: (
          <LazyPage>
            <RecipeBuilderPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/recipes/:id/edit',
        element: (
          <LazyPage>
            <RecipeBuilderPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/recipes/:id',
        element: (
          <LazyPage>
            <RecipeDetailPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/recipe-costing',
        element: (
          <LazyPage>
            <RecipeCostingDashboardPage />
          </LazyPage>
        ),
      },
      {
        path: 'app/recipe-costing/price-impact',
        element: (
          <LazyPage>
            <RecipePriceImpactPage />
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
  return (
    <CustomDomainCatalogHost>
      <RouterProvider router={router} future={ROUTER_FUTURE} />
    </CustomDomainCatalogHost>
  )
}

export default App
