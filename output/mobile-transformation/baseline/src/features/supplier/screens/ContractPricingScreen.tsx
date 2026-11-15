import { useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  useContractPricing,
  useCreateContractPricing,
  useDeactivateContractPricing,
  useRestaurants,
  useSupplierProducts,
  useUpdateContractPricing,
} from '../../../services/api/queries'
import type { ContractPriceRow } from '../../../types/contractPricing'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import { usePermissions } from '../../../hooks/usePermissions'
import { useToast } from '../../shared/ToastProvider'
import {
  Button,
  Card,
  EmptyState,
  FlashList,
  LoadingState,
  Screen,
  SectionHeader,
  StatCard,
} from '../../../components/ui'
import { SearchField } from '../../../components/ui/SearchField'
import { ApiError } from '../../../services/api/client'
import { formatMoney } from '../../../utils/format'
import { colors, theme, type } from '../../../theme'

const STATUS_FILTERS = [
  { key: 'active', label: 'Active' },
  { key: 'all', label: 'All' },
  { key: 'inactive', label: 'Inactive' },
] as const

export function ContractPricingScreen() {
  const { canAny } = usePermissions()
  const canManage = canAny('CATALOG_EDIT', 'CATALOG_MANAGE')
  const showToast = useToast()
  const insets = useSafeAreaInsets()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<(typeof STATUS_FILTERS)[number]['key']>('active')
  const debouncedSearch = useDebouncedValue(search)

  const [editRow, setEditRow] = useState<ContractPriceRow | null>(null)
  const [editPrice, setEditPrice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createRestaurantId, setCreateRestaurantId] = useState('')
  const [createProductId, setCreateProductId] = useState('')
  const [createProductSearch, setCreateProductSearch] = useState('')
  const [createPrice, setCreatePrice] = useState('')

  const query = useContractPricing({
    status: statusFilter,
    q: debouncedSearch || undefined,
  })
  const restaurantsQuery = useRestaurants()
  const debouncedProductSearch = useDebouncedValue(createProductSearch)
  const productsQuery = useSupplierProducts(
    createOpen ? { q: debouncedProductSearch || undefined, limit: '50' } : undefined
  )

  const createPricing = useCreateContractPricing()
  const updatePricing = useUpdateContractPricing()
  const deactivatePricing = useDeactivateContractPricing()

  const pricing = query.data?.pricing ?? []
  const restaurants = restaurantsQuery.data?.restaurants ?? []
  const products = productsQuery.data?.products ?? []
  const restaurantCount = useMemo(
    () => new Set(pricing.map((row) => row.restaurant_id)).size,
    [pricing]
  )

  const busy = createPricing.isPending || updatePricing.isPending || deactivatePricing.isPending

  const openEdit = (row: ContractPriceRow) => {
    if (!canManage) return
    setEditRow(row)
    setEditPrice(row.price != null ? String(row.price) : '')
  }

  const confirmDeactivate = (row: ContractPriceRow) => {
    if (!canManage) return
    Alert.alert(
      'Deactivate price?',
      `${row.product_name ?? 'Product'} for ${row.restaurant_name ?? 'restaurant'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: () => {
            void deactivatePricing
              .mutateAsync(row.id)
              .then(() => showToast('Contract price deactivated.', 'success'))
              .catch((error) => showToast(apiMessage(error), 'error'))
          },
        },
      ]
    )
  }

  const saveEdit = async () => {
    if (!editRow) return
    const price = Number(editPrice)
    if (!Number.isFinite(price) || price <= 0) {
      showToast('Enter a valid price.', 'error')
      return
    }
    try {
      await updatePricing.mutateAsync({ id: editRow.id, price })
      showToast('Contract price updated.', 'success')
      setEditRow(null)
    } catch (error) {
      showToast(apiMessage(error), 'error')
    }
  }

  const openCreate = () => {
    setCreateRestaurantId(restaurants[0]?.id ?? '')
    setCreateProductId('')
    setCreateProductSearch('')
    setCreatePrice('')
    setCreateOpen(true)
  }

  const saveCreate = async () => {
    const price = Number(createPrice)
    if (!createRestaurantId || !createProductId) {
      showToast('Pick a restaurant and product.', 'error')
      return
    }
    if (!Number.isFinite(price) || price <= 0) {
      showToast('Enter a valid price.', 'error')
      return
    }
    try {
      await createPricing.mutateAsync({
        restaurantId: createRestaurantId,
        productId: createProductId,
        price,
      })
      showToast('Contract price saved.', 'success')
      setCreateOpen(false)
    } catch (error) {
      showToast(apiMessage(error), 'error')
    }
  }

  if (query.isLoading && !query.data) return <LoadingState />

  return (
    <Screen
      title="Contract pricing"
      subtitle="Per-restaurant negotiated prices"
      padded={false}
      right={
        canManage ? (
          <Pressable accessibilityRole="button" onPress={openCreate} style={styles.addBtn}>
            <Ionicons name="add" size={22} color={colors.brand} />
          </Pressable>
        ) : undefined
      }
    >
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search restaurant, product, or SKU"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
      >
        {STATUS_FILTERS.map((filter) => {
          const active = statusFilter === filter.key
          return (
            <Pressable
              key={filter.key}
              accessibilityRole="button"
              onPress={() => setStatusFilter(filter.key)}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                {filter.label}
              </Text>
            </Pressable>
          )
        })}
      </ScrollView>

      <View style={styles.statsWrap}>
        <View style={styles.statsRow}>
          <StatCard
            value={pricing.length}
            label="Price lines"
            icon="pricetag-outline"
            tone="brand"
          />
          <StatCard
            value={restaurantCount}
            label="Restaurants"
            icon="storefront-outline"
            tone="info"
          />
        </View>
      </View>

      <FlashList
        data={pricing}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
        ListHeaderComponent={<SectionHeader style={styles.section}>Contract prices</SectionHeader>}
        ListEmptyComponent={
          <EmptyState
            title="No contract prices"
            message={
              search
                ? 'Try a broader search or change the status filter.'
                : canManage
                  ? 'Tap + to set a negotiated price for a restaurant.'
                  : 'Contract prices set on web will appear here.'
            }
            icon="pricetag-outline"
          />
        }
        renderItem={({ item }) => (
          <PricingRow
            item={item}
            canManage={canManage}
            onPress={() => openEdit(item)}
            onLongPress={() => confirmDeactivate(item)}
          />
        )}
      />

      <Modal
        visible={!!editRow}
        animationType="slide"
        transparent
        onRequestClose={() => setEditRow(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.backdrop} onPress={busy ? undefined : () => setEditRow(null)} />
          <View
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetContent}
            >
              <Text style={styles.sheetTitle} numberOfLines={2}>
                {editRow?.product_name ?? 'Product'}
              </Text>
              <Text style={styles.sheetMeta} numberOfLines={1}>
                {editRow?.restaurant_name ?? 'Restaurant'}
                {editRow?.product_sku ? ` · SKU ${editRow.product_sku}` : ''}
              </Text>
              <Text style={type.label}>Contract price</Text>
              <TextInput
                value={editPrice}
                onChangeText={setEditPrice}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                editable={!busy}
              />
              <Button
                label="Save price"
                loading={updatePricing.isPending}
                onPress={() => void saveEdit()}
              />
              <Button
                label="Cancel"
                variant="outline"
                disabled={busy}
                onPress={() => setEditRow(null)}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={createOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCreateOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable
            style={styles.backdrop}
            onPress={busy ? undefined : () => setCreateOpen(false)}
          />
          <View
            style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, theme.spacing.md) }]}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetContent}
            >
              <Text style={styles.sheetTitle}>New contract price</Text>
              <Text style={type.label}>Restaurant</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pickerRow}
              >
                {restaurants.map((restaurant) => {
                  const active = createRestaurantId === restaurant.id
                  return (
                    <Pressable
                      key={restaurant.id}
                      accessibilityRole="button"
                      onPress={() => setCreateRestaurantId(restaurant.id)}
                      style={[styles.pickerChip, active && styles.pickerChipActive]}
                    >
                      <Text
                        style={[styles.pickerChipText, active && styles.pickerChipTextActive]}
                        numberOfLines={1}
                      >
                        {restaurant.name}
                      </Text>
                    </Pressable>
                  )
                })}
              </ScrollView>

              <Text style={type.label}>Product</Text>
              <SearchField
                value={createProductSearch}
                onChangeText={setCreateProductSearch}
                placeholder="Search your catalog"
              />
              <ScrollView
                style={styles.productList}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                {products.map((product) => {
                  const active = createProductId === product.id
                  return (
                    <Pressable
                      key={product.id}
                      accessibilityRole="button"
                      onPress={() => setCreateProductId(product.id)}
                      style={[styles.productRow, active && styles.productRowActive]}
                    >
                      <Text style={type.title} numberOfLines={1}>
                        {product.name}
                      </Text>
                      {product.sku ? (
                        <Text style={styles.productSku}>SKU {product.sku}</Text>
                      ) : null}
                    </Pressable>
                  )
                })}
              </ScrollView>

              <Text style={type.label}>Price</Text>
              <TextInput
                value={createPrice}
                onChangeText={setCreatePrice}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                editable={!busy}
              />
              <Button
                label="Save contract price"
                loading={createPricing.isPending}
                onPress={() => void saveCreate()}
              />
              <Button
                label="Cancel"
                variant="outline"
                disabled={busy}
                onPress={() => setCreateOpen(false)}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  )
}

function PricingRow({
  item,
  canManage,
  onPress,
  onLongPress,
}: {
  item: ContractPriceRow
  canManage: boolean
  onPress: () => void
  onLongPress: () => void
}) {
  const currency = item.currency ?? 'USD'
  const inactive = item.is_active === false

  return (
    <Pressable
      disabled={!canManage}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [pressed && canManage && styles.rowPressed]}
    >
      <Card style={styles.card}>
        <Text style={type.title} numberOfLines={2}>
          {item.product_name ?? 'Product'}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {item.restaurant_name ?? 'Restaurant'}
          {item.product_sku ? ` · SKU ${item.product_sku}` : ''}
        </Text>
        <View style={styles.priceRow}>
          <Text style={styles.price}>
            {item.price != null ? formatMoney(item.price, currency) : '—'}
          </Text>
          {inactive ? (
            <View style={styles.inactiveBadge}>
              <Text style={styles.inactiveBadgeText}>Inactive</Text>
            </View>
          ) : null}
        </View>
        {item.catalog_price != null &&
        item.price != null &&
        Number(item.catalog_price) > Number(item.price) ? (
          <Text style={styles.catalogStrike}>
            {formatMoney(item.catalog_price, currency)} catalog
          </Text>
        ) : null}
        {canManage ? <Text style={styles.hint}>Tap to edit · long-press to deactivate</Text> : null}
      </Card>
    </Pressable>
  )
}

function apiMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Request failed.'
}

const styles = StyleSheet.create({
  addBtn: { padding: 4 },
  filters: {
    paddingHorizontal: theme.spacing.md,
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surfaceMuted,
  },
  filterChipActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  filterChipText: { fontWeight: '700', color: colors.textMuted, fontSize: 13 },
  filterChipTextActive: { color: colors.brand },
  statsWrap: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm },
  statsRow: { flexDirection: 'row', gap: theme.spacing.sm },
  list: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  section: { paddingTop: 0 },
  card: { marginBottom: theme.spacing.sm },
  rowPressed: { opacity: 0.85 },
  meta: { ...type.caption, marginTop: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  price: { ...type.label, color: colors.text },
  inactiveBadge: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  inactiveBadgeText: { fontSize: 10, fontWeight: '800', color: colors.textMuted },
  catalogStrike: { ...type.caption, textDecorationLine: 'line-through', marginTop: 4 },
  hint: { ...type.caption, marginTop: 6, color: colors.textFaint },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.lg,
    maxHeight: '88%',
    overflow: 'hidden',
  },
  sheetContent: { paddingBottom: theme.spacing.sm },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: theme.spacing.xs,
  },
  sheetMeta: { color: colors.textMuted, marginBottom: theme.spacing.md },
  input: {
    marginTop: 6,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  pickerRow: { gap: theme.spacing.sm, marginBottom: theme.spacing.md, paddingVertical: 4 },
  pickerChip: {
    maxWidth: 180,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceMuted,
  },
  pickerChipActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  pickerChipText: { fontWeight: '600', color: colors.textMuted, fontSize: 13 },
  pickerChipTextActive: { color: colors.brand },
  productList: { maxHeight: 160, marginBottom: theme.spacing.sm },
  productRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    backgroundColor: colors.surfaceMuted,
  },
  productRowActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  productSku: { ...type.caption, marginTop: 2 },
})
