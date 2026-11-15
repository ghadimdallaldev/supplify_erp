import { useEffect, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import {
  useAddRestaurantInventory,
  useAdjustRestaurantInventory,
} from '../../../services/api/queries'
import type { RestaurantInventoryItem, WasteCategory } from '../../../types/inventory'
import { inventoryQuantity } from '../../../types/inventory'
import { useToast } from '../../shared/ToastProvider'
import { Button } from '../../../components/ui'
import { colors, theme, type } from '../../../theme'
import { ApiError } from '../../../services/api/client'

type AdjustMode = 'add' | 'remove' | 'waste'

const WASTE_CATEGORIES: { value: WasteCategory; label: string }[] = [
  { value: 'SPOILAGE', label: 'Spoilage' },
  { value: 'EXPIRED', label: 'Expired' },
  { value: 'OVER_PRODUCTION', label: 'Over production' },
  { value: 'BREAKAGE', label: 'Breakage' },
  { value: 'OVERPORTIONING', label: 'Over portioning' },
  { value: 'OTHER', label: 'Other' },
]

export function InventoryAdjustSheet({
  item,
  visible,
  onClose,
}: {
  item: RestaurantInventoryItem | null
  visible: boolean
  onClose: () => void
}) {
  const showToast = useToast()
  const addInventory = useAddRestaurantInventory()
  const adjustInventory = useAdjustRestaurantInventory()

  const [mode, setMode] = useState<AdjustMode>('remove')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  const [wasteCategory, setWasteCategory] = useState<WasteCategory>('SPOILAGE')

  const busy = addInventory.isPending || adjustInventory.isPending

  useEffect(() => {
    if (!visible) return
    setMode('remove')
    setQuantity('')
    setReason('')
    setWasteCategory('SPOILAGE')
  }, [visible, item?.product_id])

  if (!item) return null

  const onHand = inventoryQuantity(item)
  const unit = item.unit ? ` ${item.unit}` : ''

  const submit = async () => {
    const qty = Number(quantity)
    if (!Number.isFinite(qty) || qty <= 0) {
      showToast('Enter a quantity greater than zero.', 'error')
      return
    }

    const productId = item.product_id
    if (!productId) {
      showToast('Missing product id for this item.', 'error')
      return
    }

    try {
      if (mode === 'add') {
        await addInventory.mutateAsync({
          productId,
          quantity: qty,
          reason: reason.trim() || undefined,
        })
        showToast(`Added ${qty}${unit.trim()} to stock.`, 'success')
      } else if (mode === 'remove') {
        await adjustInventory.mutateAsync({
          productId,
          adjustmentType: 'COUNT_CORRECTION',
          quantity: qty,
          reason: reason.trim() || 'Manual count correction',
        })
        showToast(`Removed ${qty}${unit.trim()} from stock.`, 'success')
      } else {
        await adjustInventory.mutateAsync({
          productId,
          adjustmentType: 'WASTAGE',
          quantity: qty,
          reason: reason.trim() || undefined,
          wasteCategory,
        })
        showToast(`Logged ${qty}${unit.trim()} waste.`, 'success')
      }
      onClose()
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Could not update inventory.'
      showToast(message, 'error')
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={busy ? undefined : onClose}>
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose} />
      <View style={styles.sheet}>
        <Text style={styles.title} numberOfLines={2}>
          {item.product_name ?? item.sku ?? 'Inventory item'}
        </Text>
        <Text style={styles.meta}>
          {onHand}
          {unit} on hand
        </Text>

        <View style={styles.modeRow}>
          {(
            [
              ['add', 'Add'],
              ['remove', 'Remove'],
              ['waste', 'Waste'],
            ] as const
          ).map(([value, label]) => {
            const active = mode === value
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => setMode(value)}
                style={[styles.modeChip, active && styles.modeChipActive]}
              >
                <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>{label}</Text>
              </Pressable>
            )
          })}
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
          <View style={styles.field}>
            <Text style={type.label}>Quantity</Text>
            <TextInput
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              editable={!busy}
            />
          </View>

          {mode === 'waste' ? (
            <View style={styles.field}>
              <Text style={type.label}>Waste category</Text>
              <View style={styles.categoryWrap}>
                {WASTE_CATEGORIES.map((option) => {
                  const active = wasteCategory === option.value
                  return (
                    <Pressable
                      key={option.value}
                      accessibilityRole="button"
                      disabled={busy}
                      onPress={() => setWasteCategory(option.value)}
                      style={[styles.categoryChip, active && styles.categoryChipActive]}
                    >
                      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={type.label}>{mode === 'waste' ? 'Reason (optional)' : 'Note (optional)'}</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder={
                mode === 'waste'
                  ? 'Prep waste, dropped tray…'
                  : mode === 'add'
                    ? 'Delivery, count found…'
                    : 'Count correction…'
              }
              placeholderTextColor={colors.textFaint}
              style={[styles.input, styles.notes]}
              multiline
              editable={!busy}
            />
          </View>
        </ScrollView>

        <Button
          label={mode === 'add' ? 'Add stock' : mode === 'remove' ? 'Remove stock' : 'Log waste'}
          icon={mode === 'add' ? 'add-circle-outline' : mode === 'remove' ? 'remove-circle-outline' : 'trash-outline'}
          loading={busy}
          onPress={() => void submit()}
          style={styles.submit}
        />
        <Button label="Cancel" variant="outline" disabled={busy} onPress={onClose} />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    maxHeight: '88%',
  },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  meta: { color: colors.textMuted, marginTop: theme.spacing.xs, marginBottom: theme.spacing.md },
  modeRow: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  modeChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
  },
  modeChipActive: {
    borderColor: colors.brand,
    backgroundColor: colors.brandLight,
  },
  modeChipText: { fontWeight: '700', color: colors.textMuted },
  modeChipTextActive: { color: colors.brand },
  form: { paddingBottom: theme.spacing.sm },
  field: { marginBottom: theme.spacing.md },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  notes: { minHeight: 72, textAlignVertical: 'top' },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: 6 },
  categoryChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surfaceMuted,
  },
  categoryChipActive: {
    borderColor: colors.warning,
    backgroundColor: colors.warningBg,
  },
  categoryChipText: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  categoryChipTextActive: { color: colors.warning },
  submit: { marginBottom: theme.spacing.sm },
})
