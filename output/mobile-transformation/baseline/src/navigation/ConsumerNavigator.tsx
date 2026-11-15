import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { PublicDiscoveryScreen, PublicStorefrontScreen, PublicCartScreen } from '../features/publicShop/BrowseScreens'
import { PublicCheckoutScreen, PublicReceiptScreen } from '../features/publicShop/CheckoutScreens'
import {
  ConsumerAccountScreen,
  ConsumerNotificationsScreen,
  ConsumerOrderDetailScreen,
  ConsumerOrdersScreen,
  ConsumerShopUnavailableScreen,
} from '../features/publicShop/ConsumerScreens'
import { useMobilePublicShopEnabled } from '../features/publicShop/useMobilePublicShopEnabled'
import { DeleteAccountScreen } from '../features/settings/DeleteAccountScreen'
import { LoadingState } from '../components/ui'
import { tabScreenOptions, stackHeaderOptions } from './navStyle'

type ConsumerTabs = {
  Discover: undefined
  Orders: undefined
  Notifications: undefined
  Account: undefined
}

export type ConsumerStackParamList = {
  Tabs: undefined
  Storefront: { idOrSlug: string }
  Cart: undefined
  Checkout: undefined
  Receipt: { token?: string; order?: unknown }
  ConsumerOrderDetail: { orderId: string }
  DeleteAccount: undefined
}

const Tab = createBottomTabNavigator<ConsumerTabs>()
const Stack = createNativeStackNavigator<ConsumerStackParamList>()

function DiscoverGate() {
  const { enabled, isLoading } = useMobilePublicShopEnabled()
  if (isLoading) return <LoadingState />
  if (!enabled) return <ConsumerShopUnavailableScreen />
  return <PublicDiscoveryScreen />
}

function ConsumerTabsScreen() {
  const { enabled, isLoading } = useMobilePublicShopEnabled()
  if (isLoading) return <LoadingState />

  return (
    <Tab.Navigator
      key={enabled ? 'shop-on' : 'shop-off'}
      screenOptions={tabScreenOptions({
        Discover: { on: 'storefront', off: 'storefront-outline' },
        Orders: { on: 'receipt', off: 'receipt-outline' },
        Notifications: { on: 'notifications', off: 'notifications-outline' },
        Account: { on: 'person', off: 'person-outline' },
      })}
    >
      <Tab.Screen name="Discover" component={DiscoverGate} />
      {enabled ? <Tab.Screen name="Orders" component={ConsumerOrdersScreen} /> : null}
      {enabled ? <Tab.Screen name="Notifications" component={ConsumerNotificationsScreen} /> : null}
      <Tab.Screen name="Account" component={ConsumerAccountScreen} />
    </Tab.Navigator>
  )
}

export function ConsumerNavigator() {
  const { enabled, isLoading } = useMobilePublicShopEnabled()

  return (
    <Stack.Navigator screenOptions={stackHeaderOptions}>
      <Stack.Screen name="Tabs" component={ConsumerTabsScreen} options={{ headerShown: false }} />
      {!isLoading && enabled ? (
        <>
          <Stack.Screen name="Storefront" component={PublicStorefrontScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Cart" component={PublicCartScreen} />
          <Stack.Screen name="Checkout" component={PublicCheckoutScreen} />
          <Stack.Screen name="Receipt" component={PublicReceiptScreen} />
          <Stack.Screen
            name="ConsumerOrderDetail"
            component={ConsumerOrderDetailScreen}
            options={{ title: 'Order' }}
          />
        </>
      ) : null}
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ title: 'Delete account' }} />
    </Stack.Navigator>
  )
}
