import { Alert, StyleSheet, Text, View } from 'react-native'
import { useNavigation, useRoute } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RouteProp } from '@react-navigation/native'
import type { RestaurantStackParamList } from '../../../navigation/RestaurantNavigator'
import {
  useConvertQuoteToCart,
  useQuoteRequest,
  useUpdateQuoteRequestStatus,
} from '../../../services/api/queries'
import { useCartStore } from '../../../store/cartStore'
import { usePermissions } from '../../../hooks/usePermissions'
import { Button, Card, EmptyState, LoadingState, Screen, SectionHeader, StatusPill } from '../../../components/ui'
import { formatDay, formatMoney } from '../../../utils/format'
import { colors, theme, type } from '../../../theme'

export function QuoteRequestDetailScreen() {
  const route = useRoute<RouteProp<RestaurantStackParamList, 'QuoteRequestDetail'>>()
  const navigation = useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>()
  const { can } = usePermissions()
  const canCreateOrders = can('ORDERS_CREATE')
  const query = useQuoteRequest(route.params.quoteRequestId)
  const convert = useConvertQuoteToCart()
  const updateStatus = useUpdateQuoteRequestStatus()
  const addItem = useCartStore((state) => state.addItem)

  if (query.isLoading) return <LoadingState />
  if (!query.data) return <Screen title="Quote request"><EmptyState title="Quote request unavailable" /></Screen>

  const { quoteRequest, items, suppliers } = query.data
  const isOpen = quoteRequest.status === 'open'

  const addResponseToCart = async (supplierRowId: string) => {
    if (!canCreateOrders) {
      Alert.alert('Permission needed', 'You need order-create permission to add quoted items to the cart.')
      return
    }
    try {
      const cart = await convert.mutateAsync({ quoteRequestId: quoteRequest.id, supplierRowId })
      cart.items.forEach((item) => addItem(item.product, item.quantity, {
        quotedUnitPrice: item.quotedUnitPrice,
        quoteRequestSupplierId: cart.quoteRequestSupplierId,
        quoteResponseItemId: item.quoteResponseItemId,
      }))
      Alert.alert('Added to cart', `${cart.items.length} quoted item${cart.items.length === 1 ? '' : 's'} added.`)
      navigation.navigate('Cart')
    } catch (error) {
      Alert.alert('Could not add quote', error instanceof Error ? error.message : 'Try again.')
    }
  }

  const changeStatus = (status: 'closed' | 'cancelled') => {
    const label = status === 'closed' ? 'Close' : 'Cancel'
    Alert.alert(
      `${label} quote request?`,
      status === 'closed'
        ? 'Suppliers will no longer be able to respond, and locked quote prices will stop applying at checkout.'
        : 'This request will be cancelled. Quote prices from this RFQ will no longer apply at checkout.',
      [
        { text: 'Keep open', style: 'cancel' },
        {
          text: label,
          style: status === 'cancelled' ? 'destructive' : 'default',
          onPress: () => {
            void (async () => {
              try {
                await updateStatus.mutateAsync({ quoteRequestId: quoteRequest.id, status })
                await query.refetch()
              } catch (error) {
                Alert.alert(
                  `Could not ${label.toLowerCase()} request`,
                  error instanceof Error ? error.message : 'Try again.'
                )
              }
            })()
          },
        },
      ]
    )
  }

  return (
    <Screen title="Quote request" subtitle={`Created ${formatDay(quoteRequest.createdAt)}`} scroll right={<StatusPill status={quoteRequest.status} />}>
      {quoteRequest.neededBy ? <Text style={styles.summary}>Needed by {formatDay(quoteRequest.neededBy)}</Text> : null}
      {quoteRequest.note ? <Text style={styles.note}>{quoteRequest.note}</Text> : null}
      {isOpen ? (
        <View style={styles.statusActions}>
          <Button
            label="Close request"
            variant="outline"
            onPress={() => changeStatus('closed')}
            loading={updateStatus.isPending}
            disabled={updateStatus.isPending}
            style={styles.statusButton}
          />
          <Button
            label="Cancel request"
            variant="danger"
            onPress={() => changeStatus('cancelled')}
            loading={updateStatus.isPending}
            disabled={updateStatus.isPending}
            style={styles.statusButton}
          />
        </View>
      ) : null}
      <SectionHeader>Requested items</SectionHeader>
      {items.map((item) => <Card key={item.id} elevated={false}><Text style={type.title}>{item.productName}</Text><Text style={styles.meta}>{item.quantity} {item.unit ?? item.productUnit ?? 'unit(s)'}</Text>{item.notes ? <Text style={styles.meta}>{item.notes}</Text> : null}</Card>)}
      <SectionHeader>Supplier responses</SectionHeader>
      {suppliers.map((supplier) => (
        <Card key={supplier.id}>
          <View style={styles.headerRow}><Text style={[type.title, styles.flex]}>{supplier.supplierName}</Text><StatusPill status={supplier.status} /></View>
          {supplier.response?.note ? <Text style={styles.note}>{supplier.response.note}</Text> : null}
          {supplier.response?.items.map((responseItem) => {
            const requested = items.find((item) => item.id === responseItem.quoteRequestItemId)
            return <View key={responseItem.id ?? responseItem.quoteRequestItemId} style={styles.responseLine}><Text style={styles.flex} numberOfLines={2}>{requested?.productName ?? 'Item'}</Text><Text style={responseItem.isAvailable ? styles.price : styles.unavailable}>{responseItem.isAvailable && responseItem.unitPrice != null ? formatMoney(responseItem.unitPrice, responseItem.currency) : 'Unavailable'}</Text></View>
          })}
          {supplier.status === 'responded' && isOpen ? <Button label="Use this quote" icon="cart-outline" onPress={() => void addResponseToCart(supplier.id)} loading={convert.isPending && convert.variables?.supplierRowId === supplier.id} disabled={convert.isPending} style={styles.action} /> : null}
        </Card>
      ))}
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  summary: { color: colors.text, fontWeight: '700', marginBottom: 8 },
  note: { color: colors.textMuted, marginTop: 6, marginBottom: 8, lineHeight: 20 },
  meta: { ...type.label, marginTop: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  responseLine: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
  price: { color: colors.success, fontWeight: '800' },
  unavailable: { color: colors.danger, fontWeight: '700' },
  action: { marginTop: theme.spacing.md },
  statusActions: { flexDirection: 'row', gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  statusButton: { flex: 1 },
})
