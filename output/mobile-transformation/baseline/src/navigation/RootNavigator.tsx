import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../features/auth/AuthContext'
import { resolveAppRoleNav } from '../hooks/usePermissions'
import { AuthNavigator } from './AuthNavigator'
import { DriverNavigator } from './DriverNavigator'
import { RestaurantNavigator } from './RestaurantNavigator'
import { SupplierNavigator } from './SupplierNavigator'
import { AdminNavigator } from './AdminNavigator'
import { ConsumerNavigator } from './ConsumerNavigator'
import { colors } from '../theme'
import { businessSessionKey } from '../features/auth/sessionIsolation'

export function RootNavigator() {
  const { user, isLoading, billingLocked } = useAuth()

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.brand} />
      </View>
    )
  }

  if (billingLocked) return <AuthNavigator initialRoute="BillingLocked" />
  // Cold start must be B2B sign-in — not the public guest Discover shop.
  if (!user) return <AuthNavigator initialRoute="Login" />

  const nav = resolveAppRoleNav(user)
  const sessionKey = businessSessionKey(user) ?? 'signed-out'
  switch (nav) {
    case 'pending':
      return <AuthNavigator initialRoute="Pending" />
    case 'staff_deferred':
      return <AuthNavigator initialRoute="StaffDeferred" />
    case 'driver':
      return <DriverNavigator key={sessionKey} />
    case 'restaurant':
      return <RestaurantNavigator key={sessionKey} />
    case 'supplier':
      return <SupplierNavigator key={sessionKey} />
    case 'admin':
      return <AdminNavigator key={sessionKey} />
    case 'consumer':
      return <ConsumerNavigator key={sessionKey} />
    default:
      return <AuthNavigator initialRoute="Login" />
  }
}
