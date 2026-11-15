import { useCallback, useState } from 'react'
import { RefreshControl, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSupplierInventoryList } from '../../../services/api/queries/supplierInventory'
import type { SupplierInventoryItem } from '../../../types/supplierInventory'
import { usePermissions } from '../../../hooks/usePermissions'
import {
  countSupplierLowStockItems,
  resolveSupplierInventoryStatus,
  supplierStockTone,
} from '../../../utils/supplierStockStatus'
import {
  Card,
  EmptyState,
  FlashList,
  LoadingState,
  Screen,
  SectionHeader,
  StatCard,
  StatusPill,
} from '../../../components/ui'
import { OpenOnWebRow } from '../../shared/OpenOnWebRow'
import { colors, theme, type } from '../../../theme'
import { SupplierInventoryAdjustSheet } from './SupplierInventoryAdjustSheet'

export function SupplierInventoryScreen() {
  const { canAny } = usePermissions()
  const canEdit = canAny('INVENTORY_EDIT', 'INVENTORY_MANAGE')
  const query = useSupplierInventoryList()
  const rows = query.data ?? []
  const [selected, setSelected] = useState<SupplierInventoryItem | null>(null)

  const openAdjust = useCallback(
    (item: SupplierInventoryItem) => {
      if (!canEdit) return
      setSelected(item)
    },
    [canEdit]
  )
  const closeAdjust = useCallback(() => setSelected(null), [])

  if (query.isLoading) return <LoadingState />

  const lowStockCount = countSupplierLowStockItems(rows)
  const outOfStockCount = rows.filter((item) => (item.available_qty ?? 0) <= 0).length

  return (
    <Screen
      title="Inventory"
      subtitle={canEdit ? 'Tap an item to set on-hand quantity' : 'Supplier stock levels'}
      scroll={false}
      padded={false}
    >
      <View style={styles.statsWrap}>
        <View style={styles.statsRow}>
          <StatCard value={rows.length} label="SKUs tracked" icon="cube-outline" tone="info" />
          <StatCard value={lowStockCount} label="Low stock" icon="warning-outline" tone="warning" />
        </View>
        <StatCard
          value={outOfStockCount}
          label="Out of stock"
          icon="alert-circle-outline"
          tone="danger"
          style={styles.fullStat}
        />
      </View>
      <FlashList
        data={rows}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id || item.product_id}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
        ListHeaderComponent={<SectionHeader style={styles.section}>Stock levels</SectionHeader>}
        ListEmptyComponent={
          <EmptyState
            icon="layers-outline"
            title="No inventory rows"
            message="Products with stock tracking will appear here."
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <SectionHeader style={styles.section}>Manage on web</SectionHeader>
            <View style={styles.footerGroup}>
              <OpenOnWebRow title="Adjustments & settings" path="/app/inventory" />
            </View>
          </View>
        }
        renderItem={({ item }) => (
          <InventoryRow item={item} editable={canEdit} onPress={() => openAdjust(item)} />
        )}
      />
      <SupplierInventoryAdjustSheet item={selected} visible={selected != null} onClose={closeAdjust} />
    </Screen>
  )
}

function InventoryRow({
  item,
  editable,
  onPress,
}: {
  item: SupplierInventoryItem
  editable: boolean
  onPress: () => void
}) {
  const { label, status } = resolveSupplierInventoryStatus(item)
  const tone = supplierStockTone(status)

  return (
    <Card style={styles.card} onPress={editable ? onPress : undefined}>
      <View style={styles.rowTop}>
        <Text style={[type.title, styles.titleFlex]} numberOfLines={1}>
          {item.product_name ?? item.sku ?? 'Product'}
        </Text>
        <StatusPill status={label} tone={tone} />
        {editable ? <Ionicons name="chevron-forward" size={18} color={colors.textFaint} /> : null}
      </View>
      <Text style={styles.meta}>
        {item.available_qty} available
        {item.reserved_qty != null && item.reserved_qty > 0 ? ` · ${item.reserved_qty} reserved` : ''}
      </Text>
      {item.sku ? <Text style={styles.sku}>{item.sku}</Text> : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  statsWrap: { paddingHorizontal: theme.spacing.md, paddingTop: theme.spacing.sm },
  statsRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.sm },
  fullStat: { marginBottom: theme.spacing.sm },
  list: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl },
  section: { marginTop: theme.spacing.sm, marginBottom: theme.spacing.sm },
  card: { marginBottom: theme.spacing.sm },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  titleFlex: { flex: 1 },
  meta: { color: colors.textMuted, marginTop: 6, fontWeight: '500' },
  sku: { ...type.label, marginTop: 4, color: colors.textFaint },
  footer: { marginTop: theme.spacing.md },
  footerGroup: { gap: theme.spacing.sm },
})
