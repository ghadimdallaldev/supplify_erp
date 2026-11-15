import { useAppLocale as useUiLocale } from "../i18n";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { LoginScreen } from "../screens/LoginScreen";
import { PendingScreen } from "../screens/PendingScreen";
import { DeferredScreen } from "../screens/DeferredScreen";
import { BillingLockedScreen } from "../screens/BillingLockedScreen";
import { PublicShopNavigator } from "./PublicShopNavigator";

export type AuthStackParamList = {
  Login: undefined;
  Pending: undefined;
  StaffDeferred: undefined;
  BillingLocked: undefined;
  /** Optional guest public-catalog browse — never the cold-start default. Gated by admin flag. */
  GuestShop: undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthNavigator({
  initialRoute = "Login",
}: {
  initialRoute?: keyof AuthStackParamList;
}) {
  useUiLocale();

  return (
    <Stack.Navigator
      initialRouteName={initialRoute}
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Pending" component={PendingScreen} />
      <Stack.Screen name="StaffDeferred" component={DeferredScreen} />
      <Stack.Screen name="BillingLocked" component={BillingLockedScreen} />
      <Stack.Screen name="GuestShop" component={PublicShopNavigator} />
    </Stack.Navigator>
  );
}
