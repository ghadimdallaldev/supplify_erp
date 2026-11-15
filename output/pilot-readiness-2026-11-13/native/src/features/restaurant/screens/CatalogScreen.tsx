import { useMemo, useState } from 'react'
import { Alert, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NavigationProp, RouteProp } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import type { RestaurantStackParamList } from '../../../navigation/RestaurantNavigator'
import { useInfiniteProducts } from '../../../services/api/queries'
import { useCartStore } from '../../../store/cartStore'
import { usePermissions } from '../../../hooks/usePermissions'
import { useEntitlementMap } from '../../../hooks/useEntitlements'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import type { Product } from '../../../types/supplify'
import { EmptyState, ErrorState, FlashList, LoadingState, Screen } from '../../../components/ui'
import { SearchField } from '../../../components/ui/SearchField'
import { FilterBar } from '../../../components/ui/FilterBar'
import { V2ProductRow, V2SectionHeader } from '../../../components/ui/v2'
import { formatMoney } from '../../../utils/format'
import { colors, theme } from '../../../theme'
import { getProductMoq, getProductOrderMultiple } from '../../../lib/orderQuantityRules'

type ProductWithImage = Product & { image_thumb_url?: string; image_url?: string }

export function CatalogScreen() {
  const { params } = useRoute<RouteProp<RestaurantStackParamList, 'Catalog'>>()
  const navigation = useNavigation<NavigationProp<RestaurantStackParamList>>()
  const { can } = usePermissions()
  const { isEnabled, isLoading: entitlementsLoading } = useEntitlementMap()
  const canCreateOrders = can('ORDERS_CREATE')
  const [search, setSearch] = useState('')
  const [navChip, setNavChip] = useState<'all' | 'lists' | 'deals'>('all')
  const debouncedSearch = useDebouncedValue(search)
  const addItem = useCartStore((state) => state.addItem)
  const cartItems = useCartStore((state) => state.items)
  const cartQuantities = useMemo(
    () => new Map(cartItems.map((cartItem) => [cartItem.product.id, cartItem.quantity])),
    [cartItems]
  )
  const query = useInfiniteProducts({
    supplier: params.supplierId,
    includeStock: 'true',
    q: debouncedSearch,
  })
  const products = (query.data?.pages.flatMap((page) => page.products) ?? []) as ProductWithImage[]
  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0)
  const hasContract = products.some((p) => p.pricing_source === 'CONTRACT_PRICE')
  const showListsChip = !entitlementsLoading && isEnabled('quick_lists')
  const showDealsChip = !entitlementsLoading && isEnabled('supplier_deals')

  const chipOptions = useMemo(() => {
    const opts: Array<{ key: string; label: string }> = [{ key: 'all', label: 'All' }]
    if (showListsChip) opts.push({ key: 'lists', label: 'My lists' })
    if (showDealsChip) opts.push({ key: 'deals', label: 'Deals' })
    return opts
  }, [showListsChip, showDealsChip])

  const onChipChange = (key: string) => {
    if (key === 'lists') {
      navigation.navigate('QuickLists')
      return
    }
    if (key === 'deals') {
      navigation.navigate('Deals')
      return
    }
    setNavChip('all')
  }

  if (query.isLoading && !query.data) return <LoadingState />

  const cartRight = canCreateOrders ? (
    <Pressable
      onPress={() => navigation.navigate('Cart')}
      style={styles.cartBtn}
      accessibilityRole="button"
      accessibilityLabel={`Cart, ${cartCount} items`}
    >
      <Ionicons name="cart-outline" size={22} color={colors.text} />
      {cartCount > 0 ? (
        <View style={styles.cartBadge}>
          <Text style={styles.cartBadgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
        </View>
      ) : null}
    </Pressable>
  ) : undefined

  return (
    <Screen
      title={params.supplierName}
      subtitle={
        hasContract
          ? `Catalog · Contract pricing · ${products.length}`
          : `${products.length} products`
      }
      padded={false}
      right={cartRight}
    >
      <SearchField value={search} onChangeText={setSearch} placeholder="Search products or SKU" />
      {chipOptions.length > 1 ? (
        <FilterBar options={chipOptions} value={navChip} onChange={onChipChange} />
      ) : null}
      <V2SectionHeader>{search ? 'Results' : 'Products'}</V2SectionHeader>
      {query.isError ? (
        <ErrorState
          message="Could not load products. Check your connection and try again."
          onRetry={() => void query.refetch()}
        />
      ) : (
      <FlashList
        data={products}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage()
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          <EmptyState
            title="No matching products"
            message={search ? 'Try a broader search.' : 'This supplier has no listed products.'}
          />
        }
        renderItem={({ item }) => {
          const image = item.image_thumb_url ?? item.image_url
          const cartQuantity = cartQuantities.get(item.id) ?? 0
          const badges: Array<{ label: string; tone?: 'brand' | 'success' | 'warning' | 'neutral' }> =
            []
          if (item.pricing_source === 'CONTRACT_PRICE') badges.push({ label: 'Contract', tone: 'brand' })
          if (item.pricing_source === 'QUOTE_PRICE') badges.push({ label: 'Quote', tone: 'warning' })
          const packBits = [
            getProductMoq(item) > 1 ? `MOQ ${getProductMoq(item)}` : null,
            getProductOrderMultiple(item) > 1 ? `Pack ×${getProductOrderMultiple(item)}` : null,
            item.sku ? `SKU ${item.sku}` : null,
            item.unit ? String(item.unit) : null,
          ].filter(Boolean)
          const stockLabel =
            item.available_qty != null
              ? `${item.available_qty} in stock`
              : packBits.length
                ? packBits.join(' · ')
                : undefined
          const strike =
            item.pricing_source === 'CONTRACT_PRICE' &&
            item.catalog_price != null &&
            item.current_price != null &&
            Number(item.catalog_price) > Number(item.current_price)
              ? formatMoney(item.catalog_price, item.currency)
              : undefined
          return (
            <V2ProductRow
              name={item.name}
              meta={packBits.length && item.available_qty != null ? packBits.join(' · ') : undefined}
              price={
                item.current_price != null
                  ? `${formatMoney(item.current_price, item.currency)}${item.unit ? ` / ${item.unit}` : ''}`
                  : 'Price on request'
              }
              strikePrice={strike}
              badges={badges}
              stockLabel={stockLabel}
              imageUri={image}
              cartQuantity={cartQuantity}
              onAdd={canCreateOrders ? () => {
                if (useCartStore.getState().checkoutAttempt) {
                  Alert.alert('Check your checkout', 'Resolve the pending checkout in your cart before adding products.', [
                    { text: 'Open cart', onPress: () => navigation.navigate('Cart') },
                    { text: 'Cancel', style: 'cancel' },
                  ])
                  return
                }
                addItem(item)
              } : undefined}
              addDisabled={!canCreateOrders}
            />
          )
        }}
      />
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  cartBtn: {
    width: theme.touchMin,
    height: theme.touchMin,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: 6,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadgeText: { color: colors.onBrand, fontSize: 9, fontWeight: '700' },
})
