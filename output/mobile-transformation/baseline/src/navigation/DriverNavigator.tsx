import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'

import { createNativeStackNavigator } from '@react-navigation/native-stack'

import { DriverHomeScreen } from '../features/driver/screens/DriverHomeScreen'

import { DriverStopScreen } from '../features/driver/screens/DriverStopScreen'

import { DeliveryProofScreen } from '../features/driver/screens/DeliveryProofScreen'

import { ProblemReportScreen } from '../features/driver/screens/ProblemReportScreen'

import { DriverRunSheetScreen } from '../features/driver/screens/DriverRunSheetScreen'

import { DriverMoreScreen } from '../features/driver/screens/DriverMoreScreen'

import { NotificationsScreen } from '../features/restaurant/screens/NotificationsScreen'

import { NotificationPreferencesScreen } from '../features/settings/NotificationPreferencesScreen'

import { DeleteAccountScreen } from '../features/settings/DeleteAccountScreen'

import { tabScreenOptions, stackHeaderOptions } from './navStyle'

export type DriverStackParamList = {
  DriverHome: undefined

  DriverStop: { orderId: string; driverAssignmentId?: string }

  DeliveryProof: {
    orderId: string
    restaurantName: string
    driverAssignmentId?: string
    warehouseAssignmentId?: string
  }

  ProblemReport: {
    orderId: string
    restaurantName: string
    driverAssignmentId?: string
    warehouseAssignmentId?: string
  }

  DriverRunSheet: undefined
}

export type DriverTabParamList = {
  Deliveries: undefined

  More: undefined
}

export type DriverRootStackParamList = {
  Tabs: undefined

  NotificationPreferences: undefined
  DeleteAccount: undefined

  Notifications: undefined

  DriverRunSheet: undefined
}

const Tab = createBottomTabNavigator<DriverTabParamList>()

const DeliveriesStack = createNativeStackNavigator<DriverStackParamList>()

const RootStack = createNativeStackNavigator<DriverRootStackParamList>()

function DeliveriesNavigator() {
  return (
    <DeliveriesStack.Navigator screenOptions={stackHeaderOptions}>
      <DeliveriesStack.Screen name="DriverHome" component={DriverHomeScreen} options={{ title: 'Today' }} />

      <DeliveriesStack.Screen name="DriverStop" component={DriverStopScreen} options={{ title: 'Delivery' }} />

      <DeliveriesStack.Screen name="DeliveryProof" component={DeliveryProofScreen} options={{ title: 'Confirm delivery' }} />

      <DeliveriesStack.Screen name="ProblemReport" component={ProblemReportScreen} options={{ title: 'Report problem' }} />

      <DeliveriesStack.Screen name="DriverRunSheet" component={DriverRunSheetScreen} options={{ title: 'Run sheet' }} />
    </DeliveriesStack.Navigator>
  )
}

function DriverTabs() {
  return (
    <Tab.Navigator
      screenOptions={tabScreenOptions({
        Deliveries: { on: 'navigate', off: 'navigate-outline' },

        More: { on: 'menu', off: 'menu-outline' },
      })}
    >
      <Tab.Screen name="Deliveries" component={DeliveriesNavigator} options={{ title: 'Today' }} />

      <Tab.Screen name="More" component={DriverMoreScreen} />
    </Tab.Navigator>
  )
}

export function DriverNavigator() {
  return (
    <RootStack.Navigator screenOptions={stackHeaderOptions}>
      <RootStack.Screen name="Tabs" component={DriverTabs} options={{ headerShown: false }} />

      <RootStack.Screen name="Notifications" component={NotificationsScreen} />

      <RootStack.Screen name="NotificationPreferences" component={NotificationPreferencesScreen} options={{ title: 'Notification settings' }} />

      <RootStack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ title: 'Delete account' }} />

      <RootStack.Screen name="DriverRunSheet" component={DriverRunSheetScreen} options={{ title: 'Run sheet' }} />
    </RootStack.Navigator>
  )
}
