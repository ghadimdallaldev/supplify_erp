import { View, StyleSheet } from 'react-native'
import { RouteProp, useRoute } from '@react-navigation/native'
import { Screen, EmptyState, Button } from '../components/ui'
import { useAuth } from '../features/auth/AuthContext'
import { theme } from '../theme'

type Params = { feature?: string; reason?: string }

export function DeferredScreen() {
  const route = useRoute<RouteProp<Record<string, Params>, string>>()
  const feature = route.params?.feature ?? 'This feature'
  const reason = route.params?.reason ?? 'Available on the web app for now.'
  const { logout } = useAuth()

  return (
    <Screen title="Supplify">
      <View style={styles.body}>
        <EmptyState
          icon="desktop-outline"
          title={`${feature} — web only`}
          message={reason}
        />
      </View>
      <View style={styles.footer}>
        <Button label="Sign out" variant="danger" icon="log-out-outline" onPress={() => void logout()} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center' },
  footer: { paddingVertical: theme.spacing.md },
})
