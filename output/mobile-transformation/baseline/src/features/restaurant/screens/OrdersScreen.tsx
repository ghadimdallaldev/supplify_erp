import { useMemo, useState } from 'react'
import { RefreshControl, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RestaurantStackParamList } from '../../../navigation/RestaurantNavigator'
import { useOrders } from '../../../services/api/queries'
import {
  EmptyState,
  ErrorState,
  FilterBar,
  FlashList,
  ListSkeleton,
  Screen,
} from '../../../components/ui'
import { SearchField } from '../../../components/ui/SearchField'
import { V2OrderRow } from '../../../components/ui/v2'
import { formatDay, formatMoney, formatOrderRef, orderShortId } from '../../../utils/format'
import { theme } from '../../../theme'

const OPEN_STATUSES = ['PLACED', 'ACKNOWLEDGED', 'PROCESSING', 'SHIPPED']
const DONE_STATUSES = ['DELIVERED', 'RECEIVED', 'COMPLETED']

type FilterKey = 'all' | 'open' | 'delivered' | 'cancelled'

export function OrdersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')
  const query = useOrders({ limit: '50' })
  const allOrders = query.data?.orders ?? []

  const counts = useMemo(
    () => ({
      all: allOrders.length,
      open: allOrders.filter((o) => OPEN_STATUSES.includes(o.status)).length,
      delivered: allOrders.filter((o) => DONE_STATUSES.includes(o.status)).length,
      cancelled: allOrders.filter((o) => o.status === 'CANCELLED').length,
    }),
    [allOrders]
  )

  const orders = useMemo(() => {
    const term = search.trim().toLowerCase()
    return allOrders.filter((order) => {
      const matchesSearch =
        !term ||
        order.supplier_name?.toLowerCase().includes(term) ||
        orderShortId(order.id).toLowerCase().includes(term)
      const matchesFilter =
        filter === 'all' ||
        (filter === 'open'
          ? OPEN_STATUSES.includes(order.status)
          : filter === 'delivered'
            ? DONE_STATUSES.includes(order.status)
            : order.status === 'CANCELLED')
      return matchesSearch && matchesFilter
    })
  }, [allOrders, search, filter])

  return (
    <Screen title="Orders" subtitle={`${orders.length} shown`} padded={false}>
      <SearchField value={search} onChangeText={setSearch} placeholder="Supplier or order number" />
      <FilterBar
        options={[
          { key: 'all', label: 'All', count: counts.all },
          { key: 'open', label: 'Open', count: counts.open },
          { key: 'delivered', label: 'Delivered', count: counts.delivered },
          { key: 'cancelled', label: 'Cancelled', count: counts.cancelled },
        ]}
        value={filter}
        onChange={(k) => setFilter(k as FilterKey)}
      />
      {query.isLoading && !query.data ? (
        <ListSkeleton rows={8} />
      ) : query.isError ? (
        <ErrorState
          message="Could not load your orders. Check your connection and try again."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <FlashList
          data={orders}
          contentContainerStyle={styles.list}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
          }
          ListEmptyComponent={
            <EmptyState
              title="No matching orders"
              message={
                search || filter !== 'all'
                  ? 'Try a different search or filter.'
                  : 'Place an order from a supplier catalog.'
              }
              icon="receipt-outline"
            />
          }
          renderItem={({ item }) => (
            <V2OrderRow
              title={item.supplier_name ?? 'Order'}
              subtitle={formatDay(item.created_at)}
              note={
                item.items?.length
                  ? `${formatOrderRef(item.id)} · ${item.items.length} line${item.items.length === 1 ? '' : 's'}`
                  : formatOrderRef(item.id)
              }
              meta={formatMoney(item.total_amount, item.currency)}
              status={item.status}
              domain="order"
              onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}
            />
          )}
        />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { paddingBottom: theme.spacing.xxl },
})
