import { View, StyleSheet } from 'react-native'
import { Screen, EmptyState, Button } from '../components/ui'
import { useAuth } from '../features/auth/AuthContext'
import { theme } from '../theme'

export function BillingLockedScreen() {
  const { logout, clearBillingLock } = useAuth()

  return (
    <Screen title="Supplify">
      <View style={styles.body}>
        <EmptyState
          icon="lock-closed-outline"
          title="Account locked"
          message="Billing is overdue. Resolve payment on the web app to restore access."
        />
      </View>
      <View style={styles.actions}>
        <Button label="Try again" icon="refresh-outline" onPress={() => clearBillingLock()} />
        <Button label="Sign out" variant="outline" onPress={() => logout()} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center' },
  actions: { gap: theme.spacing.sm, paddingVertical: theme.spacing.md },
})
