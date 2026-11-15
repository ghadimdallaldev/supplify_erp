import { useMemo, useState } from 'react'
import { Alert, Linking, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { useSupplierProducts } from '../../../services/api/queries/supplier'
import { useDebouncedValue } from '../../../hooks/useDebouncedValue'
import { usePermissions } from '../../../hooks/usePermissions'
import type { Product } from '../../../types/supplify'
import { Card, EmptyState, FlashList, LoadingState, Screen } from '../../../components/ui'
import { SearchField } from '../../../components/ui/SearchField'
import { formatMoney } from '../../../utils/format'
import { webAppUrl } from '../../../utils/webAppUrl'
import { colors, theme, type } from '../../../theme'

type ProductWithImage = Product & { image_thumb_url?: string; image_url?: string }

function stockLabel(qty: number | undefined): string {
  if (qty == null) return 'Stock unknown'
  if (qty <= 0) return 'Out of stock'
  return `${qty} in stock`
}

function stockTone(qty: number | undefined): 'success' | 'danger' | 'neutral' {
  if (qty == null) return 'neutral'
  if (qty <= 0) return 'danger'
  return 'success'
}

export function SupplierProductsScreen() {
  const { can, canAny } = usePermissions()
  const canEdit = canAny('CATALOG_EDIT', 'CATALOG_MANAGE')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const query = useSupplierProducts({ q: debouncedSearch || undefined, limit: '100' })
  const products = useMemo(
    () => (query.data?.products ?? []) as ProductWithImage[],
    [query.data?.products]
  )

  const openOnWeb = (path: string) => {
    void Linking.openURL(webAppUrl(path))
  }

  const handleProductPress = (item: ProductWithImage) => {
    if (!canEdit) return
    Alert.alert(item.name, 'Full create, price, and bulk edit are on web for now.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Edit on web', onPress: () => openOnWeb('/app/products') },
    ])
  }

  if (query.isLoading && !query.data) return <LoadingState />

  return (
    <Screen
      title="Product catalog"
      subtitle={`${products.length} products`}
      padded={false}
      right={
        canEdit ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => openOnWeb('/app/products')}
            style={styles.webTools}
          >
            <Ionicons name="open-outline" size={18} color={colors.brand} />
            <Text style={styles.webToolsText}>Web</Text>
          </Pressable>
        ) : undefined
      }
    >
      <SearchField value={search} onChangeText={setSearch} placeholder="Search name or SKU" />
      {canEdit ? (
        <Pressable style={styles.webHint} onPress={() => openOnWeb('/app/products')}>
          <Ionicons name="information-circle-outline" size={16} color={colors.textMuted} />
          <Text style={styles.webHintText}>
            Tap a product or use Web tools for create, pricing, and bulk import.
          </Text>
        </Pressable>
      ) : null}
      <FlashList
        data={products}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="cube-outline"
            title="No matching products"
            message={
              search
                ? 'Try a broader search.'
                : can('CATALOG_EDIT')
                  ? 'Add products on web, then refresh here.'
                  : 'Your catalog is empty.'
            }
          />
        }
        renderItem={({ item }) => {
          const image = item.image_thumb_url ?? item.image_url
          const tone = stockTone(item.available_qty)
          return (
            <Pressable
              disabled={!canEdit}
              onPress={() => handleProductPress(item)}
              style={({ pressed }) => [pressed && canEdit && styles.rowPressed]}
            >
              <Card style={styles.card}>
                <View style={styles.row}>
                  {image ? (
                    <Image
                      source={{ uri: image }}
                      style={styles.thumb}
                      contentFit="cover"
                      transition={150}
                      recyclingKey={item.id}
                    />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Text style={styles.thumbLetter}>{item.name.charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.info}>
                    <Text style={type.title} numberOfLines={2}>
                      {item.name}
                    </Text>
                    {item.sku ? <Text style={styles.sku}>SKU {item.sku}</Text> : null}
                    <Text style={styles.price}>
                      {item.current_price != null
                        ? formatMoney(item.current_price, item.currency)
                        : 'No price set'}
                      {item.unit ? ` / ${item.unit}` : ''}
                    </Text>
                    <View style={styles.metaRow}>
                      <View
                        style={[
                          styles.stockBadge,
                          tone === 'success' && styles.stockSuccess,
                          tone === 'danger' && styles.stockDanger,
                        ]}
                      >
                        <Text
                          style={[
                            styles.stockText,
                            tone === 'success' && styles.stockTextSuccess,
                            tone === 'danger' && styles.stockTextDanger,
                          ]}
                        >
                          {stockLabel(item.available_qty)}
                        </Text>
                      </View>
                      {item.category ? (
                        <Text style={styles.category} numberOfLines={1}>
                          {item.category}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  {canEdit ? (
                    <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                  ) : null}
                </View>
              </Card>
            </Pressable>
          )
        }}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.md, paddingTop: 0, paddingBottom: theme.spacing.xxl },
  webHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.xs,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.sm,
    borderRadius: theme.radius.md,
    backgroundColor: colors.backgroundAlt,
  },
  webHintText: { ...type.caption, flex: 1, color: colors.textMuted },
  card: { marginBottom: theme.spacing.sm },
  rowPressed: { opacity: 0.92 },
  row: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  thumb: {
    width: 68,
    height: 68,
    borderRadius: theme.radius.md,
    backgroundColor: colors.backgroundAlt,
  },
  thumbPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: theme.radius.md,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbLetter: { fontSize: 22, fontWeight: '800', color: colors.brandDark },
  info: { flex: 1 },
  sku: { ...type.caption, marginTop: 2 },
  price: { ...type.label, color: colors.text, marginTop: 4 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.xs,
    marginTop: theme.spacing.xs,
  },
  stockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
    backgroundColor: colors.backgroundAlt,
  },
  stockSuccess: { backgroundColor: colors.successBg },
  stockDanger: { backgroundColor: colors.dangerBg },
  stockText: { fontSize: 11, fontWeight: '700', color: colors.textMuted },
  stockTextSuccess: { color: colors.success },
  stockTextDanger: { color: colors.danger },
  category: { ...type.caption, flexShrink: 1 },
  webTools: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8 },
  webToolsText: { fontSize: 13, fontWeight: '700', color: colors.brand },
})
