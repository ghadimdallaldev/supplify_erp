import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { colors, theme } from '../../theme'

export function OfflineBanner() {
  const { isOffline } = useNetworkStatus()
  const insets = useSafeAreaInsets()
  if (!isOffline) return null

  return (
    <View
      style={[styles.bar, { paddingTop: insets.top > 0 ? insets.top : theme.spacing.xs }]}
      accessibilityRole="alert"
      accessibilityLabel="You are offline. Some actions may fail until connection returns."
    >
      <Text style={styles.text}>You're offline — check your connection</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.warning,
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  text: {
    color: colors.onBrand,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
  },
})
