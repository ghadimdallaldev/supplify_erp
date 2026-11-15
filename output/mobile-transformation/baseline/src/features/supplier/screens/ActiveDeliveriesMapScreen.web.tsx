import { FlatList, StyleSheet, Text, View } from 'react-native'
import { useSupplierDeliveryBoard } from '../../../services/api/queries'
import { getGpsStatusLabel } from '../../../utils/deliveryEtaDisplay'
import { Card, LoadingState } from '../../../components/ui'
import { colors, theme } from '../../../theme'

export function ActiveDeliveriesMapScreen() {
  const { data, isLoading } = useSupplierDeliveryBoard()
  const orders = data?.orders ?? []

  const live = orders.filter((o) => o.tracking?.hasLocation && !o.tracking?.isStale).length
  const stale = orders.filter((o) => o.tracking?.hasLocation && o.tracking?.isStale).length
  const noGps = orders.length - live - stale

  if (isLoading) return <LoadingState />

  return (
    <View style={styles.container}>
      <Text style={styles.summary}>
        Live {live} · Not updating {stale} · No location {noGps}
      </Text>
      <Text style={styles.webNote}>Map view is available in the iOS and Android app.</Text>
      <FlatList
        data={orders}
        keyExtractor={(item) => item.orderId}
        style={styles.list}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.name}>{item.restaurantName}</Text>
            <Text style={styles.meta}>{getGpsStatusLabel(item.tracking)}</Text>
          </Card>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  summary: { padding: theme.spacing.md, fontWeight: '600', color: colors.text },
  webNote: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm, color: colors.textMuted },
  list: { flex: 1, padding: theme.spacing.md },
  name: { fontWeight: '600', color: colors.text },
  meta: { color: colors.textMuted, marginTop: 4 },
})
