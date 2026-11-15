import { useState } from 'react'
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RestaurantStackParamList } from '../../../navigation/RestaurantNavigator'
import { useQuoteRequests } from '../../../services/api/queries'
import { useCartStore } from '../../../store/cartStore'
import { usePermissions } from '../../../hooks/usePermissions'
import { Button, EmptyState, FlashList, ListRow, LoadingState, Screen, StatusPill } from '../../../components/ui'
import { formatDay } from '../../../utils/format'
import { colors, theme } from '../../../theme'

const FILTERS = ['all', 'open', 'closed', 'cancelled'] as const

export function QuoteRequestsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>()
  const [status, setStatus] = useState<(typeof FILTERS)[number]>('all')
  const { can } = usePermissions()
  const cartCount = useCartStore((state) => state.items.length)
  const query = useQuoteRequests({ status: status === 'all' ? undefined : status, limit: 50 })
  const rows = query.data?.quoteRequests ?? []

  if (query.isLoading) return <LoadingState />

  return (
    <Screen
      title="Quote requests"
      subtitle={`${query.data?.pagination.total ?? rows.length} total`}
      padded={false}
      right={
        can('ORDERS_CREATE') ? (
          <Button
            label={cartCount ? `New (${cartCount})` : 'New'}
            icon="add-outline"
            onPress={() => navigation.navigate('CreateQuoteRequest')}
            style={styles.newButton}
          />
        ) : undefined
      }
    >
      <View style={styles.filters}>
        {FILTERS.map((filter) => (
          <Pressable
            key={filter}
            onPress={() => setStatus(filter)}
            style={[styles.filter, status === filter && styles.filterActive]}
          >
            <Text style={[styles.filterText, status === filter && styles.filterTextActive]}>
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>
      <FlashList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
        ListEmptyComponent={
          <EmptyState
            icon="document-text-outline"
            title="No quote requests"
            message="Add products to your cart, then request supplier pricing."
          />
        }
        renderItem={({ item }) => (
          <ListRow
            icon="document-text-outline"
            iconTone={item.status === 'open' ? 'info' : 'neutral'}
            title={`${item.itemCount ?? 0} item${item.itemCount === 1 ? '' : 's'}`}
            subtitle={`${item.responseCount ?? 0}/${item.supplierCount ?? 0} responses · ${formatDay(item.createdAt)}`}
            right={<StatusPill status={item.status} />}
            onPress={() => navigation.navigate('QuoteRequestDetail', { quoteRequestId: item.id })}
            style={styles.row}
          />
        )}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  newButton: { minHeight: 40, paddingHorizontal: theme.spacing.md },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm },
  filter: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: theme.radius.pill, backgroundColor: colors.surfaceMuted },
  filterActive: { backgroundColor: colors.brand },
  filterText: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  filterTextActive: { color: colors.onBrand },
  list: { padding: theme.spacing.md, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.xxl },
  row: { marginBottom: theme.spacing.sm },
})
