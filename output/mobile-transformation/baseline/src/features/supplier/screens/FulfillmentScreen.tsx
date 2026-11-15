import { useState } from 'react'
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  useAssignDriver,
  useFulfillmentDispatch,
  useFulfillmentDrivers,
  useReassignDriver,
  useRolloverAssignment,
  useRetryFailedDelivery,
} from '../../../services/api/queries'
import { Button, Card, EmptyState, FlashList, ListRow, LoadingState, Screen, StatusPill } from '../../../components/ui'
import { formatMoney } from '../../../utils/format'
import type { DispatchOrderCard } from '../../../types/orders-ext'
import { colors, theme, type } from '../../../theme'

type DriverMode = 'assign' | 'reassign' | 'retry'

export function FulfillmentScreen() {
  const { data, isLoading, refetch } = useFulfillmentDispatch()
  const { data: driversData } = useFulfillmentDrivers()
  const assignDriver = useAssignDriver()
  const reassignDriver = useReassignDriver()
  const rollover = useRolloverAssignment()
  const retryDelivery = useRetryFailedDelivery()

  const [driverModalVisible, setDriverModalVisible] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<DispatchOrderCard | null>(null)
  const [driverMode, setDriverMode] = useState<DriverMode>('assign')
  const [retryReason, setRetryReason] = useState('')

  const orders = data?.orders ?? []
  const drivers = driversData?.drivers ?? []

  const openDriverPicker = (order: DispatchOrderCard, mode: DriverMode) => {
    setSelectedOrder(order)
    setDriverMode(mode)
    setRetryReason('')
    setDriverModalVisible(true)
  }

  const closeDriverPicker = () => {
    setDriverModalVisible(false)
    setSelectedOrder(null)
    setRetryReason('')
  }

  const driverLabel = (d: { full_name?: string; fullName?: string }) =>
    d.full_name ?? d.fullName ?? 'Driver'

  const pickDriver = (driverId: string) => {
    if (!selectedOrder) return
    const orderId = selectedOrder.id
    const onDone = () => {
      closeDriverPicker()
      void refetch()
    }
    const onError = (e: unknown) => {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update driver')
    }

    if (driverMode === 'reassign' && retryReason.trim().length < 3) {
      Alert.alert('Reassignment reason required', 'Enter at least 3 characters explaining the reassignment.')
      return
    }

    if (driverMode === 'retry') {
      if (!retryReason.trim() || retryReason.trim().length < 3) {
        Alert.alert('Retry reason required', 'Enter at least 3 characters explaining the new delivery attempt.')
        return
      }
      if (!selectedOrder.assignment?.id) {
        Alert.alert('Cannot retry', 'The failed delivery attempt is no longer available.')
        return
      }
      retryDelivery.mutate(
        { orderId, source_driver_assignment_id: selectedOrder.assignment.id, driver_id: driverId, reason: retryReason.trim() },
        { onSuccess: onDone, onError },
      )
      return
    }

    if (driverMode === 'assign') {
      assignDriver.mutate(
        {
          orderId,
          driver_id: driverId,
          warehouse_assignment_id: selectedOrder?.assignment?.warehouse_assignment_id,
        },
        { onSuccess: onDone, onError },
      )
    } else {
      reassignDriver.mutate(
        {
          orderId,
          driver_id: driverId,
          reason: retryReason.trim(),
          driver_assignment_id: selectedOrder?.assignment?.id,
          warehouse_assignment_id: selectedOrder?.assignment?.warehouse_assignment_id,
        },
        { onSuccess: onDone, onError },
      )
    }
  }

  const confirmRollover = (order: DispatchOrderCard) => {
    const assignmentId = order.assignment?.id
    if (!assignmentId) {
      Alert.alert('Cannot move', 'This order has no active assignment.')
      return
    }
    Alert.alert(
      'Move to tomorrow',
      `Move delivery for ${order.restaurant_name} to tomorrow?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Move',
          onPress: () => {
            rollover.mutate(assignmentId, {
              onSuccess: () => void refetch(),
              onError: (e) =>
                Alert.alert('Error', e instanceof Error ? e.message : 'Could not rollover'),
            })
          },
        },
      ]
    )
  }

  const busy = assignDriver.isPending || reassignDriver.isPending || rollover.isPending

  if (isLoading) return <LoadingState />

  return (
    <Screen title="Dispatch" subtitle={`${orders.length} orders`} padded={false}>
      <FlashList
        data={orders}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.sm }} />}
        ListEmptyComponent={
          <EmptyState
            icon="car-outline"
            title="Nothing to dispatch"
            message="Fulfilled orders waiting for driver assignment will appear here."
          />
        }
        renderItem={({ item }) => (
          <DispatchCard
            order={item}
            busy={busy}
            onAssign={() => openDriverPicker(item, 'assign')}
            onReassign={() => openDriverPicker(item, 'reassign')}
            onRetry={() => openDriverPicker(item, 'retry')}
            onRollover={() => confirmRollover(item)}
          />
        )}
      />

      <Modal
        visible={driverModalVisible}
        animationType="slide"
        transparent
        onRequestClose={closeDriverPicker}
      >
        <Pressable style={styles.backdrop} onPress={closeDriverPicker} />
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>
            {driverMode === 'assign' ? 'Assign driver' : driverMode === 'retry' ? 'Retry delivery' : 'Reassign driver'}
          </Text>
          {selectedOrder ? (
            <Text style={styles.sheetSub}>{selectedOrder.restaurant_name}</Text>
          ) : null}
          {driverMode !== 'assign' ? (
            <TextInput
              style={styles.reasonInput}
              placeholder="Reason required for this action"
              value={retryReason}
              onChangeText={setRetryReason}
              multiline
            />
          ) : null}
          {drivers.length === 0 ? (
            <Text style={styles.sheetMeta}>No drivers available</Text>
          ) : (
            drivers.map((d) => (
              <ListRow
                key={d.id}
                icon="person-outline"
                iconTone="brand"
                title={driverLabel(d)}
                onPress={() => pickDriver(d.id)}
                style={busy ? { opacity: 0.6 } : undefined}
              />
            ))
          )}
          <Button label="Cancel" variant="outline" onPress={closeDriverPicker} style={styles.cancelBtn} />
        </View>
      </Modal>
    </Screen>
  )
}

function DispatchCard({
  order,
  busy,
  onAssign,
  onReassign,
  onRetry,
  onRollover,
}: {
  order: DispatchOrderCard
  busy: boolean
  onAssign: () => void
  onReassign: () => void
  onRetry: () => void
  onRollover: () => void
}) {
  const hasDriver = Boolean(order.assignment?.driver_id ?? order.assignment?.driver_name)
  const deliveryStatus = order.delivery_status ?? order.assignment?.status ?? 'pending'

  return (
    <Card style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.name} numberOfLines={1}>
          {order.restaurant_name ?? 'Order'}
        </Text>
        <StatusPill status={deliveryStatus} domain="delivery" />
      </View>
      <View style={styles.metaRow}>
        <View style={styles.metaItem}>
          <Ionicons name="cube-outline" size={14} color={colors.textMuted} />
          <Text style={styles.meta}>{order.item_count} items</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="cash-outline" size={14} color={colors.textMuted} />
          <Text style={styles.meta}>{formatMoney(order.total_amount)}</Text>
        </View>
        {order.delivery_area ? (
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color={colors.textMuted} />
            <Text style={styles.meta}>{order.delivery_area}</Text>
          </View>
        ) : null}
        {order.warehouse_name || order.warehouse_code ? (
          <View style={styles.metaItem}>
            <Ionicons name="business-outline" size={14} color={colors.textMuted} />
            <Text style={styles.meta}>
              {order.multi_warehouse && (order.warehouse_count || 0) > 1
                ? `${order.warehouse_name || order.warehouse_code} (+${(order.warehouse_count || 1) - 1})`
                : order.warehouse_name || order.warehouse_code}
            </Text>
          </View>
        ) : null}
      </View>
      {hasDriver ? (
        <Text style={styles.driver}>
          Driver: {order.assignment?.driver_name ?? 'Assigned'}
        </Text>
      ) : (
        <Text style={styles.driverMuted}>No driver assigned</Text>
      )}
      <View style={styles.actions}>
        {deliveryStatus === 'failed' ? (
          <Button
            label="Retry delivery"
            variant="primary"
            icon="refresh-outline"
            onPress={onRetry}
            disabled={busy}
            style={styles.actionBtn}
          />
        ) : hasDriver ? (
          <Button
            label="Reassign"
            variant="outline"
            icon="swap-horizontal-outline"
            onPress={onReassign}
            disabled={busy}
            style={styles.actionBtn}
          />
        ) : (
          <Button
            label="Assign"
            variant="primary"
            icon="person-add-outline"
            onPress={onAssign}
            disabled={busy}
            style={styles.actionBtn}
          />
        )}
        {order.assignment?.id ? (
          <Button
            label="Tomorrow"
            variant="ghost"
            icon="calendar-outline"
            onPress={onRollover}
            disabled={busy}
            style={styles.actionBtn}
          />
        ) : null}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.md, paddingTop: theme.spacing.xs, paddingBottom: theme.spacing.xxl },
  card: { marginBottom: 0 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: theme.spacing.sm },
  name: { ...type.title, flex: 1 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.md, marginTop: theme.spacing.sm },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  driver: { ...type.label, marginTop: theme.spacing.sm, color: colors.brand },
  driverMuted: { ...type.label, marginTop: theme.spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm, marginTop: theme.spacing.md },
  actionBtn: { flexGrow: 1, minWidth: 120 },
  reasonInput: { borderWidth: 1, borderColor: colors.border, borderRadius: theme.radius.md, padding: theme.spacing.sm, minHeight: 44, color: colors.text, marginBottom: theme.spacing.sm },
  backdrop: { flex: 1, backgroundColor: colors.backdropDark },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    maxHeight: '70%',
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: colors.text },
  sheetSub: { ...type.label, marginTop: 4, marginBottom: theme.spacing.md },
  sheetMeta: { color: colors.textMuted, marginBottom: theme.spacing.md },
  cancelBtn: { marginTop: theme.spacing.md },
})
