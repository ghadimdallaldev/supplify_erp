import { useEffect, useState } from 'react'
import { Alert, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RestaurantStackParamList } from '../../../navigation/RestaurantNavigator'
import { useQuickList, useQuickLists } from '../../../services/api/queries'
import { usePermissions } from '../../../hooks/usePermissions'
import { useCartStore } from '../../../store/cartStore'
import type { Product } from '../../../types/supplify'
import type { QuickListItem } from '../../../types/quickLists'
import {
  EmptyState,
  FlashList,
  ListRow,
  LoadingState,
  Screen,
  ToastBanner,
} from '../../../components/ui'
import { theme } from '../../../theme'

type QuickListItemRow = QuickListItem & {
  supplier_id?: string
  product_sku?: string
  product_unit?: string
  product_price?: number | string
  product_currency?: string | null
  supplier_name?: string
}

function itemToProduct(item: QuickListItemRow): Product {
  return {
    id: item.product_id,
    supplier_id: item.supplier_id ?? '',
    sku: item.product_sku ?? '',
    name: item.product_name ?? 'Product',
    unit: item.product_unit ?? item.unit,
    current_price: item.product_price != null ? Number(item.product_price) : undefined,
    currency: item.product_currency ?? undefined,
    supplier_name: item.supplier_name,
  }
}

export function QuickListsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>()
  const { can } = usePermissions()
  const canCreateOrders = can('ORDERS_CREATE')
  const { data: lists, isLoading } = useQuickLists()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const addItem = useCartStore((s) => s.addItem)
  const clear = useCartStore((s) => s.clear)

  const { data: detailRaw, isFetching, isSuccess } = useQuickList(selectedId ?? '')
  const detail = (detailRaw as { quickList?: typeof detailRaw } | null)?.quickList ?? detailRaw

  useEffect(() => {
    if (!selectedId || !isSuccess || isFetching || !detail) return

    if (!canCreateOrders) {
      Alert.alert(
        'Permission needed',
        'You need order-create permission to load a quick list into the cart.'
      )
      setSelectedId(null)
      return
    }

    const items = (detail.items ?? []) as QuickListItemRow[]
    if (!items.length) {
      Alert.alert('Empty list', 'This quick list has no items.')
      setSelectedId(null)
      return
    }

    if (useCartStore.getState().checkoutAttempt) {
      Alert.alert(
        'Check your checkout',
        'Resolve the pending checkout in your cart before loading a list.',
        [
          { text: 'Open cart', onPress: () => navigation.navigate('Cart') },
          { text: 'Cancel', style: 'cancel' },
        ]
      )
      setSelectedId(null)
      return
    }
    clear()
    for (const item of items) {
      if (item.product_id) addItem(itemToProduct(item), item.quantity ?? 1)
    }
    setSelectedId(null)
    setToast(`Loaded ${items.length} item${items.length === 1 ? '' : 's'} into cart`)
    const timer = setTimeout(() => navigation.navigate('Cart'), 500)
    return () => clearTimeout(timer)
  }, [selectedId, isSuccess, isFetching, detail, clear, addItem, navigation, canCreateOrders])

  if (isLoading) return <LoadingState />

  const rows = lists ?? []

  return (
    <Screen
      title="Quick lists"
      subtitle="Tap a list to load into cart"
      scroll={false}
      padded={false}
    >
      {toast ? <ToastBanner message={toast} tone="success" /> : null}
      {isFetching ? <LoadingState message="Loading list…" /> : null}
      <FlashList
        data={rows}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            title="No quick lists"
            message="Create quick lists on the web app to reorder faster."
            icon="list-outline"
          />
        }
        renderItem={({ item }) => (
          <ListRow
            icon="flash-outline"
            iconTone="brand"
            title={item.name}
            subtitle={
              item.item_count != null
                ? `${item.item_count} items${item.supplier_name ? ` · ${item.supplier_name}` : ''}`
                : item.supplier_name
            }
            onPress={() => setSelectedId(item.id)}
            style={styles.row}
          />
        )}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  row: { marginBottom: theme.spacing.sm },
})
