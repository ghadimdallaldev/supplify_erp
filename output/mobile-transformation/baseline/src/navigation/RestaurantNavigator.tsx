import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'

import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { RestaurantDashboardScreen } from '../features/restaurant/screens/RestaurantDashboardScreen'

import { OrdersScreen } from '../features/restaurant/screens/OrdersScreen'

import { OrderDetailScreen } from '../features/restaurant/screens/OrderDetailScreen'

import { SuppliersScreen } from '../features/restaurant/screens/SuppliersScreen'

import { CatalogScreen } from '../features/restaurant/screens/CatalogScreen'

import { CartScreen } from '../features/restaurant/screens/CartScreen'

import { ReceiveOrderScreen } from '../features/restaurant/screens/ReceiveOrderScreen'
import { ReceivingHubScreen } from '../features/restaurant/screens/ReceivingHubScreen'

import { DeliveryLocationScreen } from '../features/restaurant/screens/DeliveryLocationScreen'

import { NotificationsScreen } from '../features/restaurant/screens/NotificationsScreen'

import { QuickListsScreen } from '../features/restaurant/screens/QuickListsScreen'

import { InvoicesScreen } from '../features/restaurant/screens/InvoicesScreen'

import { InvoiceStatementScreen } from '../features/restaurant/screens/InvoiceStatementScreen'

import { DealsScreen } from '../features/restaurant/screens/DealsScreen'

import { InventoryScreen } from '../features/restaurant/screens/InventoryScreen'

import { MyPricesScreen } from '../features/restaurant/screens/MyPricesScreen'

import { ConsumerMenuScreen } from '../features/restaurant/screens/ConsumerMenuScreen'

import { ConsumerOrdersScreen } from '../features/restaurant/screens/ConsumerOrdersScreen'

import { ConsumerLoyaltyScreen } from '../features/restaurant/screens/ConsumerLoyaltyScreen'

import { RecipesScreen } from '../features/restaurant/screens/RecipesScreen'

import { RecipeCostingScreen } from '../features/restaurant/screens/RecipeCostingScreen'

import { StaffScreen } from '../features/restaurant/screens/StaffScreen'

import { DisputesScreen } from '../features/restaurant/screens/DisputesScreen'

import { CreateDisputeScreen } from '../features/restaurant/screens/CreateDisputeScreen'

import { DisputeDetailScreen } from '../features/disputes/DisputeDetailScreen'

import { QuoteRequestsScreen } from '../features/restaurant/screens/QuoteRequestsScreen'

import { CreateQuoteRequestScreen } from '../features/restaurant/screens/CreateQuoteRequestScreen'

import { QuoteRequestDetailScreen } from '../features/restaurant/screens/QuoteRequestDetailScreen'

import { ReservationsScreen } from '../features/restaurant/screens/reservations/ReservationsScreen'

import { CreateReservationScreen } from '../features/restaurant/screens/reservations/CreateReservationScreen'

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

import { ASSISTANT_ACCESS_PERMISSIONS, usePermissions } from '../hooks/usePermissions'
import { useChatConversations } from '../services/api/queries'

import { tabScreenOptions, stackHeaderOptions } from './navStyle'

export type RestaurantTabParamList = {
  Home: undefined

  Orders: undefined

  Shop: undefined

  Chat: undefined

  Host: undefined

  More: undefined
}

export type RestaurantStackParamList = {
  Tabs: undefined

  OrderDetail: { orderId: string }

  Catalog: { supplierId: string; supplierName: string }

  Cart: undefined

  Receive: { orderId?: string }

  ReceivingHub: undefined

  DeliveryLocation: undefined

  Notifications: undefined

  NotificationPreferences: undefined
  DeleteAccount: undefined

  Subscription: undefined

  QuickLists: undefined

  Invoices: undefined

  InvoiceStatement: undefined

  Deals: undefined

  Inventory: undefined

  MyPrices: undefined

  ConsumerMenu: undefined

  ConsumerOrders: undefined

  ConsumerLoyalty: undefined

  Recipes: undefined

  RecipeCosting: undefined

  Reports: undefined

  Staff: undefined

  Disputes: undefined

  DisputeDetail: { disputeId: string }

  CreateDispute: { orderId: string }

  QuoteRequests: undefined

  CreateQuoteRequest: undefined

  QuoteRequestDetail: { quoteRequestId: string }

  Reservations: undefined

  CreateReservation: undefined

  ChatThread: { conversationId: string; title?: string }

  Assistant: undefined

  MoreGroup: { title: string; items: MoreDest[] }
}

const Tab = createBottomTabNavigator<RestaurantTabParamList>()

const Stack = createNativeStackNavigator<RestaurantStackParamList>()

const FeatureChatList = withFeatureGate(ChatListScreen, 'chat', 'Chat')

const FeatureChatThread = withFeatureGate(ChatThreadScreen, 'chat', 'Chat')

const FeatureReceive = withFeatureGate(ReceiveOrderScreen, 'receiving_quality', 'Receiving')

const FeatureReceivingHub = withFeatureGate(ReceivingHubScreen, 'receiving_quality', 'Receiving')

const FeatureQuickLists = withFeatureGate(QuickListsScreen, 'quick_lists', 'Quick lists')

const FeatureInvoices = withFeatureGate(InvoicesScreen, 'finance_invoices', 'Invoices')

const FeatureStatement = withFeatureGate(InvoiceStatementScreen, 'finance_invoices', 'Statements')

const FeatureDeals = withFeatureGate(DealsScreen, 'supplier_deals', 'Deals')

const FeatureInventory = withFeatureGate(InventoryScreen, 'inventory_management', 'Inventory')

const FeatureDisputes = withFeatureGate(DisputesScreen, 'disputes_returns', 'Disputes')

const FeatureDisputeDetail = withFeatureGate(DisputeDetailScreen, 'disputes_returns', 'Dispute')

const FeatureCreateDispute = withFeatureGate(CreateDisputeScreen, 'disputes_returns', 'Disputes')

const FeatureAssistant = withFeatureGate(AssistantScreen, 'ai_assistant', 'Assistant')

const FeatureReports = withFeatureGate(ReportsScreen, 'reports', 'Reports')

const FeatureRecipes = withFeatureGate(RecipesScreen, 'recipe_costing', 'Recipes')

const FeatureRecipeCosting = withFeatureGate(
  RecipeCostingScreen,
  'recipe_costing',
  'Recipe costing'
)

function RestaurantTabs() {
  const { can, canAny } = usePermissions()
  const { isEnabled, isLoading: entitlementsLoading } = useEntitlementMap()
  const chatQueryEnabled = can('CHAT_VIEW') && !entitlementsLoading && isEnabled('chat')
  const { data: chatConversations } = useChatConversations(15_000, chatQueryEnabled)
  const chatUnread = (chatConversations ?? []).reduce(
    (total, conversation) => total + (conversation.unread_count ?? 0),
    0
  )

  const showHome = canAny(
    'ORDERS_VIEW',
    'CATALOG_VIEW',
    'RECEIVING_VIEW',
    'INVOICES_VIEW',
    'INVENTORY_VIEW'
  )

  const isHostOnly =
    can('RESERVATIONS_VIEW') &&
    !canAny('ORDERS_VIEW', 'CATALOG_VIEW', 'RECEIVING_VIEW', 'INVOICES_VIEW', 'INVENTORY_VIEW')

  const initialRoute = isHostOnly
    ? 'Host'
    : showHome
      ? 'Home'
      : can('ORDERS_VIEW')
        ? 'Orders'
        : can('CATALOG_VIEW')
          ? 'Shop'
          : can('CHAT_VIEW')
            ? 'Chat'
            : 'More'

  return (
    <Tab.Navigator
      initialRouteName={initialRoute}
      screenOptions={tabScreenOptions({
        Home: { on: 'home', off: 'home-outline' },

        Orders: { on: 'receipt', off: 'receipt-outline' },

        Shop: { on: 'storefront', off: 'storefront-outline' },

        Chat: { on: 'chatbubbles', off: 'chatbubbles-outline' },

        Host: { on: 'calendar', off: 'calendar-outline' },

        More: { on: 'menu', off: 'menu-outline' },
      })}
    >
      {showHome ? <Tab.Screen name="Home" component={RestaurantDashboardScreen} /> : null}

      {can('ORDERS_VIEW') ? <Tab.Screen name="Orders" component={OrdersScreen} /> : null}

      {can('CATALOG_VIEW') ? (
        <Tab.Screen name="Shop" component={SuppliersScreen} options={{ title: 'Suppliers' }} />
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

      {isHostOnly && can('RESERVATIONS_VIEW') ? (
        <Tab.Screen name="Host" component={ReservationsScreen} options={{ title: 'Host' }} />
      ) : null}

      <Tab.Screen name="More" component={SettingsScreen} />
    </Tab.Navigator>
  )
}

export function RestaurantNavigator() {
  const { can, canAny } = usePermissions()

  const { isEnabled } = useEntitlementMap()

  return (
    <Stack.Navigator screenOptions={stackHeaderOptions}>
      <Stack.Screen name="Tabs" component={RestaurantTabs} options={{ headerShown: false }} />

      {can('ORDERS_VIEW') ? (
        <Stack.Screen
          name="OrderDetail"
          component={OrderDetailScreen}
          options={{ title: 'Order' }}
        />
      ) : null}

      {can('CATALOG_VIEW') ? <Stack.Screen name="Catalog" component={CatalogScreen} /> : null}

      {can('ORDERS_CREATE') ? <Stack.Screen name="Cart" component={CartScreen} /> : null}

      {canAny('RECEIVING_VIEW', 'RECEIVING_MANAGE') ? (
        <Stack.Screen
          name="ReceivingHub"
          component={FeatureReceivingHub}
          options={{ title: 'Receiving queue' }}
        />
      ) : null}

      {canAny('RECEIVING_VIEW', 'RECEIVING_MANAGE') ? (
        <Stack.Screen
          name="Receive"
          component={FeatureReceive}
          options={{ headerShown: false, title: 'Receive order' }}
        />
      ) : null}

      {canAny('SETTINGS_VIEW', 'SETTINGS_EDIT', 'SETTINGS_MANAGE') ? (
        <Stack.Screen
          name="DeliveryLocation"
          component={DeliveryLocationScreen}
          options={{ title: 'Delivery location' }}
        />
      ) : null}

      <Stack.Screen name="Notifications" component={NotificationsScreen} />

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

      {can('ORDERS_VIEW') ? (
        <Stack.Screen
          name="QuickLists"
          component={FeatureQuickLists}
          options={{ title: 'Quick lists' }}
        />
      ) : null}

      {can('INVOICES_VIEW') ? <Stack.Screen name="Invoices" component={FeatureInvoices} /> : null}

      {can('INVOICES_VIEW') ? (
        <Stack.Screen
          name="InvoiceStatement"
          component={FeatureStatement}
          options={{ title: 'Statement' }}
        />
      ) : null}

      {can('PROMOTIONS_VIEW') ? <Stack.Screen name="Deals" component={FeatureDeals} /> : null}

      {can('INVENTORY_VIEW') ? (
        <Stack.Screen name="Inventory" component={FeatureInventory} />
      ) : null}

      {canAny('CATALOG_VIEW', 'ORDERS_VIEW') ? (
        <Stack.Screen name="MyPrices" component={MyPricesScreen} options={{ title: 'My prices' }} />
      ) : null}

      {can('CATALOG_VIEW') ? (
        <Stack.Screen
          name="ConsumerMenu"
          component={ConsumerMenuScreen}
          options={{ title: 'Guest menu' }}
        />
      ) : null}

      {can('ORDERS_VIEW') ? (
        <Stack.Screen
          name="ConsumerOrders"
          component={ConsumerOrdersScreen}
          options={{ title: 'Guest orders' }}
        />
      ) : null}

      {can('CATALOG_VIEW') ? (
        <Stack.Screen
          name="ConsumerLoyalty"
          component={ConsumerLoyaltyScreen}
          options={{ title: 'Guest rewards' }}
        />
      ) : null}

      {isEnabled('recipe_costing') && can('RECIPES_VIEW') ? (
        <Stack.Screen name="Recipes" component={FeatureRecipes} options={{ title: 'Recipes' }} />
      ) : null}

      {isEnabled('recipe_costing') && can('RECIPES_VIEW') ? (
        <Stack.Screen
          name="RecipeCosting"
          component={FeatureRecipeCosting}
          options={{ title: 'Recipe costing' }}
        />
      ) : null}

      {isEnabled('reports') && canAny('ORDERS_VIEW', 'INVOICES_VIEW') ? (
        <Stack.Screen name="Reports" component={FeatureReports} options={{ title: 'Reports' }} />
      ) : null}

      {can('STAFF_VIEW') ? <Stack.Screen name="Staff" component={StaffScreen} /> : null}

      {can('ORDERS_VIEW') ? <Stack.Screen name="Disputes" component={FeatureDisputes} /> : null}

      {can('ORDERS_VIEW') ? (
        <Stack.Screen
          name="DisputeDetail"
          component={FeatureDisputeDetail}
          options={{ title: 'Dispute' }}
        />
      ) : null}

      {can('ORDERS_MANAGE') ? (
        <Stack.Screen
          name="CreateDispute"
          component={FeatureCreateDispute}
          options={{ title: 'Open dispute' }}
        />
      ) : null}

      {canAny('CATALOG_VIEW', 'ORDERS_VIEW', 'ORDERS_CREATE') ? (
        <Stack.Screen name="QuoteRequests" component={QuoteRequestsScreen} />
      ) : null}

      {can('ORDERS_CREATE') ? (
        <Stack.Screen name="CreateQuoteRequest" component={CreateQuoteRequestScreen} />
      ) : null}

      {canAny('CATALOG_VIEW', 'ORDERS_VIEW', 'ORDERS_CREATE') ? (
        <Stack.Screen name="QuoteRequestDetail" component={QuoteRequestDetailScreen} />
      ) : null}

      {can('RESERVATIONS_VIEW') ? (
        <Stack.Screen
          name="Reservations"
          component={ReservationsScreen}
          options={{ headerShown: false }}
        />
      ) : null}

      {canAny('RESERVATIONS_CREATE', 'RESERVATIONS_EDIT', 'RESERVATIONS_MANAGE') ? (
        <Stack.Screen
          name="CreateReservation"
          component={CreateReservationScreen}
          options={{ title: 'New reservation' }}
        />
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
