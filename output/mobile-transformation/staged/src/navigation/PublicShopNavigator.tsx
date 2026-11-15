import { useAppLocale as useUiLocale } from "../i18n";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  PublicDiscoveryScreen,
  PublicStorefrontScreen,
  PublicCartScreen,
} from "../features/publicShop/BrowseScreens";
import {
  PublicCheckoutScreen,
  PublicReceiptScreen,
} from "../features/publicShop/CheckoutScreens";
import { GuestTrackingHistoryScreen } from "../features/publicShop/ConsumerScreens";
import { LoginScreen } from "../screens/LoginScreen";
import { stackHeaderOptions } from "./navStyle";

export type PublicShopStackParamList = {
  Discover: undefined;
  Storefront: { idOrSlug: string };
  Cart: undefined;
  Checkout: undefined;
  Receipt: { token?: string; order?: unknown };
  RecentOrders: undefined;
  Login: undefined;
};

const Stack = createNativeStackNavigator<PublicShopStackParamList>();

export function PublicShopNavigator() {
  useUiLocale();

  return (
    <Stack.Navigator
      initialRouteName="Discover"
      screenOptions={stackHeaderOptions}
    >
      <Stack.Screen
        name="Discover"
        component={PublicDiscoveryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Storefront"
        component={PublicStorefrontScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="Cart" component={PublicCartScreen} />
      <Stack.Screen name="Checkout" component={PublicCheckoutScreen} />
      <Stack.Screen name="Receipt" component={PublicReceiptScreen} />
      <Stack.Screen
        name="RecentOrders"
        component={GuestTrackingHistoryScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
