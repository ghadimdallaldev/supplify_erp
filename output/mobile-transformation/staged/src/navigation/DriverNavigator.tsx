import { copy as uiCopy } from "../i18n";
import { useAppLocale as useUiLocale } from "../i18n";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { DriverHomeScreen } from "../features/driver/screens/DriverHomeScreen";

import { DriverStopScreen } from "../features/driver/screens/DriverStopScreen";

import { DeliveryProofScreen } from "../features/driver/screens/DeliveryProofScreen";

import { ProblemReportScreen } from "../features/driver/screens/ProblemReportScreen";

import { DriverRunSheetScreen } from "../features/driver/screens/DriverRunSheetScreen";

import { DriverMoreScreen } from "../features/driver/screens/DriverMoreScreen";

import { NotificationsScreen } from "../features/restaurant/screens/NotificationsScreen";

import { NotificationPreferencesScreen } from "../features/settings/NotificationPreferencesScreen";

import { DeleteAccountScreen } from "../features/settings/DeleteAccountScreen";

import { useTabScreenOptions, stackHeaderOptions } from "./navStyle";

export type DriverStackParamList = {
  DriverHome: undefined;

  DriverStop: { orderId: string; driverAssignmentId?: string };

  DeliveryProof: {
    orderId: string;
    restaurantName: string;
    driverAssignmentId?: string;
    warehouseAssignmentId?: string;
  };

  ProblemReport: {
    orderId: string;
    restaurantName: string;
    driverAssignmentId?: string;
    warehouseAssignmentId?: string;
  };

  DriverRunSheet: undefined;
};

export type DriverTabParamList = {
  Deliveries: undefined;

  More: undefined;
};

export type DriverRootStackParamList = {
  Tabs: undefined;

  NotificationPreferences: undefined;
  DeleteAccount: undefined;

  Notifications: undefined;

  DriverRunSheet: undefined;
};

const Tab = createBottomTabNavigator<DriverTabParamList>();

const DeliveriesStack = createNativeStackNavigator<DriverStackParamList>();

const RootStack = createNativeStackNavigator<DriverRootStackParamList>();

function DeliveriesNavigator() {
  useUiLocale();

  return (
    <DeliveriesStack.Navigator screenOptions={stackHeaderOptions}>
      <DeliveriesStack.Screen
        name="DriverHome"
        component={DriverHomeScreen}
        options={{ title: uiCopy("Today") }}
      />

      <DeliveriesStack.Screen
        name="DriverStop"
        component={DriverStopScreen}
        options={{ title: uiCopy("Delivery") }}
      />

      <DeliveriesStack.Screen
        name="DeliveryProof"
        component={DeliveryProofScreen}
        options={{ title: uiCopy("Confirm delivery") }}
      />

      <DeliveriesStack.Screen
        name="ProblemReport"
        component={ProblemReportScreen}
        options={{ title: uiCopy("Report problem") }}
      />

      <DeliveriesStack.Screen
        name="DriverRunSheet"
        component={DriverRunSheetScreen}
        options={{ title: uiCopy("Run sheet") }}
      />
    </DeliveriesStack.Navigator>
  );
}

function DriverTabs() {
  const tabOptions = useTabScreenOptions({
    Deliveries: { on: "navigate", off: "navigate-outline" },

    More: { on: "menu", off: "menu-outline" },
  });

  useUiLocale();

  return (
    <Tab.Navigator screenOptions={tabOptions}>
      <Tab.Screen
        name="Deliveries"
        component={DeliveriesNavigator}
        options={{ title: uiCopy("Today") }}
      />

      <Tab.Screen name="More" component={DriverMoreScreen} />
    </Tab.Navigator>
  );
}

export function DriverNavigator() {
  useUiLocale();

  return (
    <RootStack.Navigator screenOptions={stackHeaderOptions}>
      <RootStack.Screen
        name="Tabs"
        component={DriverTabs}
        options={{ headerShown: false }}
      />

      <RootStack.Screen name="Notifications" component={NotificationsScreen} />

      <RootStack.Screen
        name="NotificationPreferences"
        component={NotificationPreferencesScreen}
        options={{ title: uiCopy("Notification settings") }}
      />

      <RootStack.Screen
        name="DeleteAccount"
        component={DeleteAccountScreen}
        options={{ title: uiCopy("Delete account") }}
      />

      <RootStack.Screen
        name="DriverRunSheet"
        component={DriverRunSheetScreen}
        options={{ title: uiCopy("Run sheet") }}
      />
    </RootStack.Navigator>
  );
}
