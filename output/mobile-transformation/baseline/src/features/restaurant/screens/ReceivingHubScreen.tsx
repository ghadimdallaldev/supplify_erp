import { RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RestaurantStackParamList } from '../../../navigation/RestaurantNavigator'
import { usePendingReceiving } from '../../../services/api/queries'
import type { Order } from '../../../types/supplify'
import { EmptyState, FlashList, ListRow, LoadingState, Screen, StatusPill } from '../../../components/ui'
import { formatDay, formatMoney } from '../../../utils/format'
import { colors, theme } from '../../../theme'

const RECEIVABLE_STATUSES = new Set(['DELIVERED', 'COMPLETED'])

function isReadyToReceive(status?: string): boolean {
  return RECEIVABLE_STATUSES.has((status ?? '').toUpperCase())
}

function receivingSubtitle(order: Order): string {
  const status = (order.status ?? '').toUpperCase()
  const parts = [
    formatDay(order.created_at),
    formatMoney(order.total_amount, order.currency),
    `${order.items?.length ?? 0} item${(order.items?.length ?? 0) === 1 ? '' : 's'}`,
  ]
  if (isReadyToReceive(status)) {
    parts.push('Ready to confirm')
  } else if (status === 'SHIPPED') {
    parts.push('In transit')
  }
  return parts.join(' · ')
}

export function ReceivingHubScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>()
  const query = usePendingReceiving()
  const orders = query.data?.orders ?? []

  if (query.isLoading) return <LoadingState />

  return (
    <Screen title="Receiving queue" subtitle={`${orders.length} pending`} padded={false} scroll={false}>
      <FlashList
        data={orders}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        ListEmptyComponent={
          <EmptyState
            title="No orders awaiting receiving"
            message="Delivered orders from suppliers will appear here for confirmation."
            icon="cube-outline"
          />
        }
        renderItem={({ item }) => (
          <View style={styles.rowWrap}>
            <ListRow
              icon="cube-outline"
              iconTone={isReadyToReceive(item.status) ? 'success' : 'info'}
              title={item.supplier_name ?? `Order #${item.id.slice(0, 8)}`}
              subtitle={receivingSubtitle(item)}
              right={<StatusPill status={item.status} domain="order" />}
              onPress={() => navigation.navigate('Receive', { orderId: item.id })}
              style={styles.row}
            />
            {!isReadyToReceive(item.status) ? (
              <Text style={styles.hint}>Waiting for supplier to mark delivered</Text>
            ) : null}
          </View>
        )}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  rowWrap: { marginBottom: theme.spacing.sm },
  row: { marginBottom: 4 },
  hint: { color: colors.textMuted, fontSize: 12, fontWeight: '500', paddingHorizontal: 4 },
})
