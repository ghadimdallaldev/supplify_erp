import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { SupplierDashboardScreen } from '../features/supplier/screens/SupplierDashboardScreen'
import { SupplierOrdersScreen } from '../features/supplier/screens/SupplierOrdersScreen'
import { SupplierOrderDetailScreen } from '../features/supplier/screens/SupplierOrderDetailScreen'
import { FulfillmentScreen } from '../features/supplier/screens/FulfillmentScreen'
import { ActiveDeliveriesMapScreen } from '../features/supplier/screens/ActiveDeliveriesMapScreen'
import { CustomersScreen } from '../features/supplier/screens/CustomersScreen'
import { SupplierNotificationsScreen } from '../features/supplier/screens/SupplierNotificationsScreen'
import { RunSheetScreen } from '../features/supplier/screens/RunSheetScreen'
import { PickListsScreen } from '../features/supplier/screens/PickListsScreen'
import { ReceivablesScreen } from '../features/supplier/screens/ReceivablesScreen'
import { IncomingDisputesScreen } from '../features/supplier/screens/IncomingDisputesScreen'
import { DisputeDetailScreen } from '../features/disputes/DisputeDetailScreen'
import { QuoteInboxScreen } from '../features/supplier/screens/QuoteInboxScreen'
import { SupplierQuoteResponseScreen } from '../features/supplier/screens/SupplierQuoteResponseScreen'
import { SupplierPromotionsScreen } from '../features/supplier/screens/SupplierPromotionsScreen'
import { SupplierProductsScreen } from '../features/supplier/screens/SupplierProductsScreen'
import { ContractPricingScreen } from '../features/supplier/screens/ContractPricingScreen'
import { SupplierWarehousesScreen } from '../features/supplier/screens/SupplierWarehousesScreen'
import { SupplierDriversScreen } from '../features/supplier/screens/SupplierDriversScreen'
import { SupplierLoyaltyScreen } from '../features/supplier/screens/SupplierLoyaltyScreen'
import { CustomerGrowthScreen } from '../features/supplier/screens/CustomerGrowthScreen'
import { SupplierInventoryScreen } from '../features/supplier/screens/SupplierInventoryScreen'
import { CreateDealScreen } from '../features/supplier/screens/CreateDealScreen'
import { DealAnalyticsScreen } from '../features/supplier/screens/DealAnalyticsScreen'
import { FeaturedPlacementScreen } from '../features/supplier/screens/FeaturedPlacementScreen'
import { ChatListScreen } from '../features/chat/screens/ChatListScreen'
import { ChatThreadScreen } from '../features/chat/screens/ChatThreadScreen'
import { AssistantScreen } from '../features/assistant/screens/AssistantScreen'
import { SettingsScreen } from '../features/settings/SettingsScreen'
import { DeleteAccountScreen } from '../features/settings/DeleteAccountScreen'
import { MoreGroupScreen } from '../features/settings/MoreGroupScreen'
import type { MoreDest } from '../features/settings/moreDest'
import { NotificationPreferencesScreen } from '../features/settings/NotificationPreferencesScreen'
import { SubscriptionScreen } from '../features/settings/SubscriptionScreen'
import { withFeatureGate } from '../features/shared/FeatureGate'
import { ReportsScreen } from '../features/shared/screens/ReportsScreen'
import { useEntitlementMap } from '../hooks/useEntitlements'
import { ASSISTANT_ACCESS_PERMISSIONS, canViewSupplierGrowth, usePermissions } from '../hooks/usePermissions'
import { useChatConversations } from '../services/api/queries'
import { useAuth } from '../features/auth/AuthContext'
import { tabScreenOptions, stackHeaderOptions } from './navStyle'
import { SupplierPublicSalesScreen } from '../features/publicShop/SupplierPublicSalesScreen'

export type SupplierTabParamList = {
  Dashboard: undefined
  /** `status` deep-links a pipeline stage from the home screen. */
  Orders: { status?: string } | undefined
  Fulfillment: undefined
  Chat: undefined
  More: undefined
}
export type SupplierStackParamList = {
  Tabs: undefined
  OrderDetail: { orderId: string }
  ActiveMap: undefined
  Customers: undefined
  Notifications: undefined
  NotificationPreferences: undefined
  DeleteAccount: undefined
  Subscription: undefined
  RunSheet: undefined
  PickLists: undefined
  Receivables: undefined
  IncomingDisputes: undefined
  DisputeDetail: { disputeId: string }
  QuoteInbox: undefined
  QuoteResponse: { quoteRequestSupplierId: string }
  Promotions: undefined
  CreateDeal: undefined
  DealAnalytics: { dealId: string; name?: string }
  FeaturedPlacement: undefined
  SupplierProducts: undefined
  ContractPricing: undefined
  SupplierWarehouses: undefined
  SupplierDrivers: undefined
  SupplierLoyalty: undefined
  CustomerGrowth: undefined
  SupplierInventory: undefined
  Reports: undefined
  ChatThread: { conversationId: string; title?: string }
  Assistant: undefined
  MoreGroup: { title: string; items: MoreDest[] }
  PublicSales: undefined
}

const Tab = createBottomTabNavigator<SupplierTabParamList>()
const Stack = createNativeStackNavigator<SupplierStackParamList>()
const FeatureFulfillment = withFeatureGate(FulfillmentScreen, 'fulfillment_tools', 'Fulfillment')
const FeatureActiveMap = withFeatureGate(
  ActiveDeliveriesMapScreen,
  'fulfillment_tools',
  'Active deliveries'
)
const FeaturePickLists = withFeatureGate(PickListsScreen, 'fulfillment_tools', 'Pick lists')
const FeatureReceivables = withFeatureGate(ReceivablesScreen, 'finance_invoices', 'Receivables')
const FeatureDisputes = withFeatureGate(IncomingDisputesScreen, 'disputes_returns', 'Disputes')
const FeatureDisputeDetail = withFeatureGate(DisputeDetailScreen, 'disputes_returns', 'Dispute')
const FeatureChatList = withFeatureGate(ChatListScreen, 'chat', 'Chat')
const FeatureChatThread = withFeatureGate(ChatThreadScreen, 'chat', 'Chat')
const FeatureAssistant = withFeatureGate(AssistantScreen, 'ai_assistant', 'Assistant')
const FeaturePromotions = withFeatureGate(SupplierPromotionsScreen, 'promotions', 'Deals & boosts')
const FeatureCreateDeal = withFeatureGate(CreateDealScreen, 'promotions', 'Create deal')
const FeatureDealAnalytics = withFeatureGate(DealAnalyticsScreen, 'promotions', 'Deal analytics')
const FeatureFeatured = withFeatureGate(FeaturedPlacementScreen, 'promotions', 'Featured placement')
const FeatureReports = withFeatureGate(ReportsScreen, 'reports', 'Reports')
const FeatureWarehouses = withFeatureGate(SupplierWarehousesScreen, 'warehouses', 'Warehouses')
const FeatureDrivers = withFeatureGate(SupplierDriversScreen, 'driver_management', 'Drivers')
const FeatureCustomerGrowth = withFeatureGate(
  CustomerGrowthScreen,
  'supplier_growth',
  'Customer growth'
)
const FeatureSupplierInventory = withFeatureGate(
  SupplierInventoryScreen,
  'inventory_management',
  'Inventory'
)

function SupplierTabs() {
  const { can } = usePermissions()
  const { isEnabled, isLoading: entitlementsLoading } = useEntitlementMap()
  const chatQueryEnabled = can('CHAT_VIEW') && !entitlementsLoading && isEnabled('chat')
  const { data: chatConversations } = useChatConversations(15_000, chatQueryEnabled)
  const chatUnread = (chatConversations ?? []).reduce(
    (total, conversation) => total + (conversation.unread_count ?? 0),
    0
  )
  const showDashboard = can('ORDERS_VIEW') && can('FULFILLMENT_VIEW')
  const initialRoute = showDashboard
    ? 'Dashboard'
    : can('ORDERS_VIEW')
      ? 'Orders'
      : can('FULFILLMENT_VIEW')
        ? 'Fulfillment'
        : can('CHAT_VIEW')
          ? 'Chat'
          : 'More'
  return (
    <Tab.Navigator
      initialRouteName={initialRoute}
      screenOptions={tabScreenOptions({
        Dashboard: { on: 'home', off: 'home-outline' },
        Orders: { on: 'receipt', off: 'receipt-outline' },
        Fulfillment: { on: 'cube', off: 'cube-outline' },
        Chat: { on: 'chatbubbles', off: 'chatbubbles-outline' },
        More: { on: 'menu', off: 'menu-outline' },
      })}
    >
      {showDashboard ? <Tab.Screen name="Dashboard" component={SupplierDashboardScreen} options={{ title: 'Home' }} /> : null}
      {can('ORDERS_VIEW') ? <Tab.Screen name="Orders" component={SupplierOrdersScreen} /> : null}
      {can('FULFILLMENT_VIEW') ? (
        <Tab.Screen name="Fulfillment" component={FeatureFulfillment} options={{ title: 'Dispatch' }} />
      ) : null}
      {can('CHAT_VIEW') ? (
        <Tab.Screen
          name="Chat"
          component={FeatureChatList}
          options={{
            title: 'Messages',
            tabBarBadge: chatUnread > 0 ? (chatUnread > 99 ? '99+' : chatUnread) : undefined,
          }}
        />
      ) : null}
      <Tab.Screen name="More" component={SettingsScreen} />
    </Tab.Navigator>
  )
}

export function SupplierNavigator() {
  const { user } = useAuth()
  const { can, canAny } = usePermissions()
  const { isEnabled } = useEntitlementMap()
  const showGrowth = isEnabled('supplier_growth') && canViewSupplierGrowth(user, can)
  return (
    <Stack.Navigator screenOptions={stackHeaderOptions}>
      <Stack.Screen name="Tabs" component={SupplierTabs} options={{ headerShown: false }} />
      {can('ORDERS_VIEW') ? (
        <Stack.Screen
          name="OrderDetail"
          component={SupplierOrderDetailScreen}
          options={{ title: 'Order' }}
        />
      ) : null}
      {can('FULFILLMENT_VIEW') ? (
        <Stack.Screen
          name="ActiveMap"
          component={FeatureActiveMap}
          options={{ title: 'Active deliveries' }}
        />
      ) : null}
      {can('ORDERS_VIEW') ? <Stack.Screen name="Customers" component={CustomersScreen} /> : null}
      <Stack.Screen name="Notifications" component={SupplierNotificationsScreen} />
      <Stack.Screen
        name="NotificationPreferences"
        component={NotificationPreferencesScreen}
        options={{ title: 'Notification settings' }}
      />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ title: 'Delete account' }} />
      <Stack.Screen
        name="Subscription"
        component={SubscriptionScreen}
        options={{ title: 'Plan & features' }}
      />
      {can('SETTINGS_VIEW') ? (
        <Stack.Screen
          name="PublicSales"
          component={SupplierPublicSalesScreen}
          options={{ title: 'Public sales' }}
        />
      ) : null}
      {canAny('ORDERS_MANAGE', 'FULFILLMENT_VIEW', 'INVOICES_VIEW') ? (
        <Stack.Screen name="RunSheet" component={RunSheetScreen} options={{ title: 'Run sheet' }} />
      ) : null}
      {can('FULFILLMENT_VIEW') ? (
        <Stack.Screen
          name="PickLists"
          component={FeaturePickLists}
          options={{ title: 'Pick lists' }}
        />
      ) : null}
      {can('INVOICES_VIEW') ? (
        <Stack.Screen name="Receivables" component={FeatureReceivables} />
      ) : null}
      {can('FULFILLMENT_VIEW') ? (
        <Stack.Screen
          name="IncomingDisputes"
          component={FeatureDisputes}
          options={{ title: 'Disputes' }}
        />
      ) : null}
      {can('FULFILLMENT_VIEW') ? (
        <Stack.Screen
          name="DisputeDetail"
          component={FeatureDisputeDetail}
          options={{ title: 'Dispute' }}
        />
      ) : null}
      {can('ORDERS_VIEW') ? <Stack.Screen name="QuoteInbox" component={QuoteInboxScreen} /> : null}
      {can('ORDERS_VIEW') ? (
        <Stack.Screen name="QuoteResponse" component={SupplierQuoteResponseScreen} />
      ) : null}
      {canAny('PROMOTIONS_VIEW', 'PROMOTIONS_MANAGE', 'CATALOG_MANAGE') ? (
        <Stack.Screen
          name="Promotions"
          component={FeaturePromotions}
          options={{ title: 'Deals & boosts' }}
        />
      ) : null}
      {canAny('PROMOTIONS_MANAGE', 'CATALOG_MANAGE') ? (
        <Stack.Screen
          name="CreateDeal"
          component={FeatureCreateDeal}
          options={{ title: 'Create deal' }}
        />
      ) : null}
      {canAny('PROMOTIONS_VIEW', 'PROMOTIONS_MANAGE', 'CATALOG_MANAGE') ? (
        <Stack.Screen
          name="DealAnalytics"
          component={FeatureDealAnalytics}
          options={{ title: 'Deal analytics' }}
        />
      ) : null}
      {canAny('PROMOTIONS_MANAGE', 'CATALOG_MANAGE', 'SETTINGS_EDIT') ? (
        <Stack.Screen
          name="FeaturedPlacement"
          component={FeatureFeatured}
          options={{ title: 'Featured placement' }}
        />
      ) : null}
      {canAny('CATALOG_VIEW', 'CATALOG_EDIT') ? (
        <Stack.Screen
          name="SupplierProducts"
          component={SupplierProductsScreen}
          options={{ title: 'Product catalog' }}
        />
      ) : null}
      {can('CATALOG_VIEW') ? (
        <Stack.Screen
          name="ContractPricing"
          component={ContractPricingScreen}
          options={{ title: 'Contract pricing' }}
        />
      ) : null}
      {isEnabled('warehouses') && can('WAREHOUSES_VIEW') ? (
        <Stack.Screen
          name="SupplierWarehouses"
          component={FeatureWarehouses}
          options={{ title: 'Warehouses' }}
        />
      ) : null}
      {isEnabled('driver_management') && can('FULFILLMENT_VIEW') ? (
        <Stack.Screen
          name="SupplierDrivers"
          component={FeatureDrivers}
          options={{ title: 'Drivers' }}
        />
      ) : null}
      {can('CATALOG_VIEW') ? (
        <Stack.Screen
          name="SupplierLoyalty"
          component={SupplierLoyaltyScreen}
          options={{ title: 'Loyalty program' }}
        />
      ) : null}
      {showGrowth ? (
        <Stack.Screen
          name="CustomerGrowth"
          component={FeatureCustomerGrowth}
          options={{ title: 'Customer growth' }}
        />
      ) : null}
      {isEnabled('inventory_management') && can('INVENTORY_VIEW') ? (
        <Stack.Screen
          name="SupplierInventory"
          component={FeatureSupplierInventory}
          options={{ title: 'Inventory' }}
        />
      ) : null}
      {isEnabled('reports') && canAny('FULFILLMENT_VIEW', 'INVOICES_VIEW', 'CATALOG_EDIT') ? (
        <Stack.Screen name="Reports" component={FeatureReports} options={{ title: 'Reports' }} />
      ) : null}
      {can('CHAT_VIEW') ? (
        <Stack.Screen
          name="ChatThread"
          component={FeatureChatThread}
          options={({ route }) => ({ title: route.params.title ?? 'Chat' })}
        />
      ) : null}
      {isEnabled('ai_assistant') && canAny(...ASSISTANT_ACCESS_PERMISSIONS) ? (
        <Stack.Screen
          name="Assistant"
          component={FeatureAssistant}
          options={{ title: 'Assistant' }}
        />
      ) : null}
      <Stack.Screen
        name="MoreGroup"
        component={MoreGroupScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
    </Stack.Navigator>
  )
}
