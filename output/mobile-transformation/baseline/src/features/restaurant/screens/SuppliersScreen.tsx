import { useMemo, useState } from 'react'
import { Alert, RefreshControl, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RestaurantStackParamList } from '../../../navigation/RestaurantNavigator'
import {
  useFollowSupplier,
  useOpenChatConversation,
  useSuppliers,
  useUnfollowSupplier,
} from '../../../services/api/queries'
import { usePermissions } from '../../../hooks/usePermissions'
import { useEntitlementMap } from '../../../hooks/useEntitlements'
import {
  EmptyState,
  ErrorState,
  FilterBar,
  FlashList,
  ListSkeleton,
  Screen,
} from '../../../components/ui'
import { SearchField } from '../../../components/ui/SearchField'
import { V2SupplierRow } from '../../../components/ui/v2'
import { useToast } from '../../shared/ToastProvider'
import type { Supplier } from '../../../types/supplify'
import { formatMoney } from '../../../utils/format'
import { theme } from '../../../theme'
import { BestPricesPanel } from '../components/BestPricesPanel'

export function SuppliersScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>()
  const { can, canAny } = usePermissions()
  const { isEnabled, isLoading: entitlementsLoading } = useEntitlementMap()
  const showToast = useToast()
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<'all' | 'following'>('all')
  const query = useSuppliers()
  const follow = useFollowSupplier()
  const unfollow = useUnfollowSupplier()
  const openConversation = useOpenChatConversation()
  const canFollow = canAny('ORDERS_CREATE', 'ORDERS_EDIT', 'ORDERS_MANAGE')
  const canChat = can('CHAT_VIEW') && can('CHAT_SEND') && !entitlementsLoading && isEnabled('chat')

  const allSuppliers = query.data?.suppliers ?? []
  const followingCount = allSuppliers.filter((s) => s.is_followed).length

  const suppliers = useMemo(() => {
    const term = search.trim().toLowerCase()
    return allSuppliers.filter((supplier) => {
      const matchesTerm =
        !term ||
        supplier.name.toLowerCase().includes(term) ||
        supplier.description?.toLowerCase().includes(term)
      return matchesTerm && (scope === 'all' || supplier.is_followed)
    })
  }, [allSuppliers, search, scope])

  const openCatalog = (supplierId: string, supplierName: string) =>
    navigation.navigate('Catalog', { supplierId, supplierName })

  const toggleFollow = async (supplier: Supplier) => {
    try {
      if (supplier.is_followed) await unfollow.mutateAsync(supplier.id)
      else await follow.mutateAsync(supplier.id)
      showToast(supplier.is_followed ? 'Supplier unfollowed.' : 'Supplier followed.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not update supplier.', 'error')
    }
  }

  const messageSupplier = async (supplier: Supplier) => {
    try {
      const conversation = await openConversation.mutateAsync({
        supplierId: supplier.id,
      })
      navigation.navigate('ChatThread', {
        conversationId: conversation.id,
        title: supplier.name,
      })
    } catch (error) {
      Alert.alert('Could not open chat', error instanceof Error ? error.message : 'Try again.')
    }
  }

  /** Only real catalog facts — product count and the supplier's order minimum. */
  const supplierMeta = (supplier: Supplier) => {
    const parts: string[] = []
    if (supplier.product_count != null) {
      parts.push(`${supplier.product_count} product${supplier.product_count === 1 ? '' : 's'}`)
    }
    const minimum = supplier.minimum_order_amount ?? supplier.minimumOrderAmount
    if (minimum != null && Number(minimum) > 0) {
      parts.push(`min. ${formatMoney(Number(minimum))}`)
    }
    return parts.join(' · ') || undefined
  }

  return (
    <Screen
      title="Suppliers"
      subtitle={scope === 'following' ? `${suppliers.length} followed` : `${suppliers.length} available`}
      padded={false}
    >
      <SearchField value={search} onChangeText={setSearch} placeholder="Search suppliers" />
      {followingCount > 0 ? (
        <FilterBar
          options={[
            { key: 'all', label: 'All', count: allSuppliers.length },
            { key: 'following', label: 'Following', count: followingCount },
          ]}
          value={scope}
          onChange={(key) => setScope(key as typeof scope)}
        />
      ) : null}

      {query.isLoading && !query.data ? (
        <ListSkeleton rows={8} />
      ) : query.isError ? (
        <ErrorState
          message="Could not load suppliers. Check your connection and try again."
          onRetry={() => void query.refetch()}
        />
      ) : (
        <FlashList
          data={suppliers}
          contentContainerStyle={styles.list}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
          }
          ListHeaderComponent={
            scope === 'all' && !search ? <BestPricesPanel onOpenSupplier={openCatalog} /> : null
          }
          ListEmptyComponent={
            <EmptyState
              title={scope === 'following' ? 'No followed suppliers' : 'No matching suppliers'}
              message={
                scope === 'following'
                  ? 'Follow a supplier to keep their catalog and prices close at hand.'
                  : search
                    ? 'Try a different search.'
                    : 'No suppliers are available yet.'
              }
              icon="storefront-outline"
            />
          }
          renderItem={({ item }) => (
            <V2SupplierRow
              name={item.name}
              note={supplierMeta(item) ?? item.description ?? undefined}
              followed={Boolean(item.is_followed)}
              onPress={() => openCatalog(item.id, item.name)}
              canFollow={canFollow}
              canMessage={canChat}
              onToggleFollow={canFollow ? () => void toggleFollow(item) : undefined}
              onMessage={canChat ? () => void messageSupplier(item) : undefined}
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
