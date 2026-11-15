import { useMemo, useState } from 'react'
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  useConsumerMenuAdmin,
  useCreateConsumerMenuItem,
  useUpdateConsumerMenuItem,
} from '../../../services/api/queries'
import type { ConsumerMenuCategory, ConsumerMenuItem } from '../../../types/consumer'
import { usePermissions } from '../../../hooks/usePermissions'
import { useToast } from '../../shared/ToastProvider'
import { OpenOnWebRow } from '../../shared/OpenOnWebRow'
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
import { ApiError } from '../../../services/api/client'
import { formatMoney } from '../../../utils/format'
import { webAppUrl } from '../../../utils/webAppUrl'
import { colors, theme, type } from '../../../theme'

type MenuListRow =
  | { kind: 'category'; key: string; category: ConsumerMenuCategory }
  | { kind: 'item'; key: string; item: ConsumerMenuItem; categoryName: string }

export function ConsumerMenuScreen() {
  const { canAny } = usePermissions()
  const canEdit = canAny('CATALOG_EDIT', 'CATALOG_MANAGE')
  const showToast = useToast()

  const query = useConsumerMenuAdmin()
  const createItem = useCreateConsumerMenuItem()
  const updateItem = useUpdateConsumerMenuItem()

  const [editItem, setEditItem] = useState<ConsumerMenuItem | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createCategoryId, setCreateCategoryId] = useState('')
  const [createName, setCreateName] = useState('')
  const [createPrice, setCreatePrice] = useState('')

  const categories = query.data?.categories ?? []
  const itemCount = useMemo(
    () => categories.reduce((sum, category) => sum + (category.items?.length ?? 0), 0),
    [categories]
  )

  const rows = useMemo<MenuListRow[]>(() => {
    const list: MenuListRow[] = []
    for (const category of categories) {
      list.push({ kind: 'category', key: `cat-${category.id}`, category })
      for (const item of category.items ?? []) {
        list.push({ kind: 'item', key: item.id, item, categoryName: category.name })
      }
    }
    return list
  }, [categories])

  const busy = createItem.isPending || updateItem.isPending

  const openEdit = (item: ConsumerMenuItem) => {
    if (!canEdit) return
    setEditItem(item)
    setEditName(item.name)
    setEditPrice(String(item.base_price ?? ''))
  }

  const toggleAvailability = (item: ConsumerMenuItem) => {
    if (!canEdit) return
    void updateItem
      .mutateAsync({ id: item.id, isAvailable: !item.is_available })
      .then(() =>
        showToast(item.is_available ? 'Item marked unavailable (86).' : 'Item available again.', 'success')
      )
      .catch((error) => showToast(apiMessage(error), 'error'))
  }

  const saveEdit = async () => {
    if (!editItem) return
    const basePrice = Number(editPrice)
    const name = editName.trim()
    if (!name) {
      showToast('Name is required.', 'error')
      return
    }
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      showToast('Enter a valid price.', 'error')
      return
    }
    try {
      await updateItem.mutateAsync({ id: editItem.id, name, basePrice })
      showToast('Menu item updated.', 'success')
      setEditItem(null)
    } catch (error) {
      showToast(apiMessage(error), 'error')
    }
  }

  const openCreate = () => {
    const firstCategory = categories.find((category) => category.is_active !== false) ?? categories[0]
    if (!firstCategory) {
      Alert.alert(
        'Add a category on web',
        'Create a menu category on web first, then add items here.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Open web', onPress: () => void Linking.openURL(webAppUrl('/app/consumer-menu')) },
        ]
      )
      return
    }
    setCreateCategoryId(firstCategory.id)
    setCreateName('')
    setCreatePrice('')
    setCreateOpen(true)
  }

  const saveCreate = async () => {
    const basePrice = Number(createPrice)
    const name = createName.trim()
    if (!createCategoryId) {
      showToast('Pick a category.', 'error')
      return
    }
    if (!name) {
      showToast('Name is required.', 'error')
      return
    }
    if (!Number.isFinite(basePrice) || basePrice < 0) {
      showToast('Enter a valid price.', 'error')
      return
    }
    try {
      await createItem.mutateAsync({ categoryId: createCategoryId, name, basePrice })
      showToast('Menu item added.', 'success')
      setCreateOpen(false)
    } catch (error) {
      showToast(apiMessage(error), 'error')
    }
  }

  if (query.isLoading && !query.data) return <LoadingState />

  return (
    <Screen
      title="Guest menu"
      subtitle="Categories and items for guest ordering"
      padded={false}
      right={
        canEdit ? (
          <Pressable accessibilityRole="button" onPress={openCreate} style={styles.addBtn}>
            <Text style={styles.addText}>Add</Text>
          </Pressable>
        ) : undefined
      }
    >
      <View style={styles.statsWrap}>
        <View style={styles.statsRow}>
          <StatCard value={categories.length} label="Categories" icon="list-outline" tone="brand" />
          <StatCard value={itemCount} label="Menu items" icon="restaurant-outline" tone="info" />
        </View>
      </View>

      <FlashList
        data={rows}
        keyExtractor={(row) => row.key}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }
        ListEmptyComponent={
          <EmptyState
            title="No guest menu yet"
            message={
              canEdit
                ? 'Set up categories on web, then add items here or on web.'
                : 'Menu items configured on web will appear here.'
            }
            icon="restaurant-outline"
          />
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <SectionHeader style={styles.section}>Advanced on web</SectionHeader>
            <View style={styles.footerGroup}>
              <OpenOnWebRow title="Modifiers, QR, and import" path="/app/consumer-menu" />
            </View>
          </View>
        }
        renderItem={({ item: row }) => {
          if (row.kind === 'category') {
            const count = row.category.items?.length ?? 0
            return (
              <SectionHeader style={styles.categoryHeader}>
                {row.category.name}
                {count ? ` · ${count}` : ''}
              </SectionHeader>
            )
          }
          return (
            <MenuItemRow
              item={row.item}
              categoryName={row.categoryName}
              canEdit={canEdit}
              onPress={() => openEdit(row.item)}
              onToggleAvailability={() => toggleAvailability(row.item)}
            />
          )
        }}
      />

      <Modal visible={!!editItem} animationType="slide" transparent onRequestClose={() => setEditItem(null)}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : () => setEditItem(null)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Edit menu item</Text>
          <Text style={type.label}>Name</Text>
          <TextInput value={editName} onChangeText={setEditName} style={styles.input} editable={!busy} />
          <Text style={type.label}>Price</Text>
          <TextInput
            value={editPrice}
            onChangeText={setEditPrice}
            keyboardType="decimal-pad"
            style={styles.input}
            editable={!busy}
          />
          <Button label="Save" loading={updateItem.isPending} onPress={() => void saveEdit()} />
          <Button label="Cancel" variant="outline" disabled={busy} onPress={() => setEditItem(null)} />
        </View>
      </Modal>

      <Modal visible={createOpen} animationType="slide" transparent onRequestClose={() => setCreateOpen(false)}>
        <Pressable style={styles.backdrop} onPress={busy ? undefined : () => setCreateOpen(false)} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>New menu item</Text>
          <Text style={type.label}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
            {categories.map((category) => {
              const active = createCategoryId === category.id
              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  onPress={() => setCreateCategoryId(category.id)}
                  style={[styles.pickerChip, active && styles.pickerChipActive]}
                >
                  <Text style={[styles.pickerChipText, active && styles.pickerChipTextActive]} numberOfLines={1}>
                    {category.name}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>
          <Text style={type.label}>Name</Text>
          <TextInput value={createName} onChangeText={setCreateName} style={styles.input} editable={!busy} />
          <Text style={type.label}>Price</Text>
          <TextInput
            value={createPrice}
            onChangeText={setCreatePrice}
            keyboardType="decimal-pad"
            style={styles.input}
            editable={!busy}
          />
          <Button label="Add item" loading={createItem.isPending} onPress={() => void saveCreate()} />
          <Button label="Cancel" variant="outline" disabled={busy} onPress={() => setCreateOpen(false)} />
        </View>
      </Modal>
    </Screen>
  )
}

function MenuItemRow({
  item,
  categoryName,
  canEdit,
  onPress,
  onToggleAvailability,
}: {
  item: ConsumerMenuItem
  categoryName: string
  canEdit: boolean
  onPress: () => void
  onToggleAvailability: () => void
}) {
  return (
    <Pressable disabled={!canEdit} onPress={onPress} style={({ pressed }) => [pressed && canEdit && styles.rowPressed]}>
      <Card style={styles.card}>
        <View style={styles.itemRow}>
          <View style={styles.flex}>
            <Text style={type.title} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {categoryName}
            </Text>
          </View>
          <Text style={styles.price}>{formatMoney(item.base_price)}</Text>
        </View>
        {!item.is_available ? (
          <View style={styles.unavailableBadge}>
            <Text style={styles.unavailableText}>86 — unavailable</Text>
          </View>
        ) : null}
        {canEdit ? (
          <Pressable accessibilityRole="button" onPress={onToggleAvailability} style={styles.toggleBtn}>
            <Text style={styles.toggleText}>
              {item.is_available ? 'Mark 86 (unavailable)' : 'Mark available'}
            </Text>
          </Pressable>
        ) : null}
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
  addBtn: { paddingHorizontal: 4, paddingVertical: 2 },
  addText: { color: colors.brand, fontWeight: '800', fontSize: 15 },
  statsWrap: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.sm },
  statsRow: { flexDirection: 'row', gap: theme.spacing.sm },
  list: { paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  section: { paddingTop: 0 },
  categoryHeader: { paddingTop: theme.spacing.sm, paddingBottom: theme.spacing.xs },
  card: { marginBottom: theme.spacing.sm },
  rowPressed: { opacity: 0.85 },
  itemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm },
  flex: { flex: 1 },
  meta: { ...type.caption, marginTop: 4 },
  price: { ...type.label, color: colors.text },
  unavailableBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: colors.warningBg,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radius.pill,
  },
  unavailableText: { fontSize: 10, fontWeight: '800', color: colors.warning },
  toggleBtn: { marginTop: 8 },
  toggleText: { ...type.caption, color: colors.brand, fontWeight: '700' },
  footer: { marginTop: theme.spacing.md },
  footerGroup: { gap: theme.spacing.sm },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.text, marginBottom: theme.spacing.md },
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
})
