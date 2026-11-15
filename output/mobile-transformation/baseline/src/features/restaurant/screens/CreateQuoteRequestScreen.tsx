import { useMemo, useState } from 'react'
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RestaurantStackParamList } from '../../../navigation/RestaurantNavigator'
import { useCreateQuoteRequest, useSuppliers } from '../../../services/api/queries'
import { useCartStore } from '../../../store/cartStore'
import { Button, Card, EmptyState, LoadingState, Screen, SectionHeader } from '../../../components/ui'
import { colors, theme, type } from '../../../theme'

export function CreateQuoteRequestScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>()
  const items = useCartStore((state) => state.items)
  const suppliersQuery = useSuppliers()
  const createQuote = useCreateQuoteRequest()
  const defaultSupplierIds = useMemo(
    () => [...new Set(items.map((item) => item.product.supplier_id).filter(Boolean))],
    [items]
  )
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>(defaultSupplierIds)
  const [note, setNote] = useState('')
  const [neededBy, setNeededBy] = useState('')

  if (suppliersQuery.isLoading) return <LoadingState />

  const toggleSupplier = (supplierId: string) => {
    setSelectedSupplierIds((current) =>
      current.includes(supplierId)
        ? current.filter((id) => id !== supplierId)
        : [...current, supplierId]
    )
  }

  const submit = async () => {
    if (!items.length) return
    if (!selectedSupplierIds.length) {
      Alert.alert('Select a supplier', 'Choose at least one supplier to receive this request.')
      return
    }
    if (neededBy && !/^\d{4}-\d{2}-\d{2}$/.test(neededBy)) {
      Alert.alert('Check the date', 'Use YYYY-MM-DD for the needed-by date.')
      return
    }
    try {
      const result = await createQuote.mutateAsync({
        items: items.map((item) => ({
          productId: item.product.id,
          quantity: item.quantity,
          unit: item.product.unit,
          notes: item.notes,
        })),
        supplierIds: selectedSupplierIds,
        note: note.trim() || undefined,
        neededBy: neededBy || undefined,
      })
      navigation.replace('QuoteRequestDetail', { quoteRequestId: result.quoteRequest.id })
    } catch (error) {
      Alert.alert('Could not send request', error instanceof Error ? error.message : 'Try again.')
    }
  }

  if (!items.length) {
    return (
      <Screen title="Request a quote" scroll>
        <EmptyState
          icon="cart-outline"
          title="Your cart is empty"
          message="Add the products and quantities you need before creating a quote request."
        />
        <Button label="Go back to shop" onPress={() => navigation.goBack()} />
      </Screen>
    )
  }

  return (
    <Screen title="Request a quote" subtitle={`${items.length} cart item${items.length === 1 ? '' : 's'}`} scroll>
      <SectionHeader>Products</SectionHeader>
      {items.map((item) => (
        <Card key={item.product.id} elevated={false}>
          <Text style={type.title}>{item.product.name}</Text>
          <Text style={styles.meta}>{item.quantity} {item.product.unit ?? 'unit(s)'}</Text>
        </Card>
      ))}

      <SectionHeader>Send to suppliers</SectionHeader>
      {(suppliersQuery.data?.suppliers ?? []).map((supplier) => {
        const selected = selectedSupplierIds.includes(supplier.id)
        return (
          <Pressable
            key={supplier.id}
            onPress={() => toggleSupplier(supplier.id)}
            style={[styles.supplier, selected && styles.supplierSelected]}
          >
            <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
              <Text style={styles.check}>{selected ? '✓' : ''}</Text>
            </View>
            <Text style={styles.supplierName}>{supplier.name}</Text>
          </Pressable>
        )
      })}

      <SectionHeader>Timing and notes</SectionHeader>
      <TextInput
        value={neededBy}
        onChangeText={setNeededBy}
        placeholder="Needed by (YYYY-MM-DD)"
        placeholderTextColor={colors.textFaint}
        style={styles.input}
        autoCapitalize="none"
      />
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Message for suppliers (optional)"
        placeholderTextColor={colors.textFaint}
        style={[styles.input, styles.notes]}
        multiline
      />
      <Button
        label={createQuote.isPending ? 'Sending…' : 'Send quote request'}
        icon="send-outline"
        onPress={() => void submit()}
        loading={createQuote.isPending}
        disabled={createQuote.isPending}
      />
    </Screen>
  )
}

const styles = StyleSheet.create({
  meta: { ...type.label, marginTop: 4 },
  supplier: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border, borderRadius: theme.radius.md, backgroundColor: colors.surface },
  supplierSelected: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  checkbox: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 7 },
  checkboxSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  check: { color: colors.onBrand, fontWeight: '900' },
  supplierName: { ...type.title, flex: 1 },
  input: { minHeight: 50, paddingHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: colors.border, borderRadius: theme.radius.md, backgroundColor: colors.surface, color: colors.text, fontSize: 15 },
  notes: { minHeight: 92, paddingTop: 14, textAlignVertical: 'top' },
})
