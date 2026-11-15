import { useMemo } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { RouteProp, useRoute } from '@react-navigation/native'
import type { SupplierStackParamList } from '../../../navigation/SupplierNavigator'
import {
  useOrder,
  useOrderAmendments,
  useOrderTracking,
  useReportOrderShortage,
  useUpdateOrder,
} from '../../../services/api/queries'
import { DeliveryTrackingMap } from '../../../components/maps/DeliveryTrackingMap'
import { pointsFromTracking } from '../../../utils/deliveryMapUtils'
import { Button, Card, EmptyState, LoadingState, StatusPill, SectionHeader, Divider } from '../../../components/ui'
import { formatMoney, formatShortDate } from '../../../utils/format'
import {
  getEtaUnavailableMessage,
  getGpsStatusLabel,
  getSupplierEtaPrimaryText,
  getSupplierEtaSecondaryText,
} from '../../../utils/deliveryEtaDisplay'
import { isRestaurantOrderTracking, type SupplierOrderTrackingResponse } from '../../../types/supplify'
import { colors, theme, type } from '../../../theme'

function amendmentChangeLabel(amendment: {
  change_type?: string | null
  changeType?: string | null
}): string {
  return String(amendment.change_type ?? amendment.changeType ?? 'change').replaceAll('_', ' ')
}

const NEXT_STATUSES: Record<string, string> = {
  PLACED: 'ACKNOWLEDGED',
  ACKNOWLEDGED: 'PROCESSING',
  PROCESSING: 'SHIPPED',
}

export function SupplierOrderDetailScreen() {
  const { params } = useRoute<RouteProp<SupplierStackParamList, 'OrderDetail'>>()
  const { data: order, isLoading, isError } = useOrder(params.orderId)
  const { data: amendmentData } = useOrderAmendments(params.orderId)
  const updateOrder = useUpdateOrder()
  const reportShortage = useReportOrderShortage()
  const activeDelivery = order?.status === 'SHIPPED'
  const { data: trackingRaw } = useOrderTracking(params.orderId, activeDelivery ? 15_000 : undefined)
  const tracking: SupplierOrderTrackingResponse | undefined =
    trackingRaw && !isRestaurantOrderTracking(trackingRaw) ? trackingRaw : undefined

  const mapPoints = useMemo(
    () =>
      pointsFromTracking(
        tracking?.tracking,
        tracking?.destination?.latitude,
        tracking?.destination?.longitude
      ),
    [tracking]
  )

  if (isLoading) return <LoadingState />
  if (isError || !order?.id) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Order not found"
        message="This order could not be loaded. It may have been removed or there was a connection issue."
      />
    )
  }

  const next = NEXT_STATUSES[order.status]

  const advance = async () => {
    if (!next) return
    try {
      await updateOrder.mutateAsync({ id: order.id, status: next })
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Update failed')
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Card>
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={2}>
            {order.customer_display_name || order.restaurant_name || 'Customer'}
          </Text>
          <StatusPill status={order.requested_delivery_method === 'PICKUP' && order.status === 'SHIPPED' ? 'READY FOR PICKUP' : order.requested_delivery_method === 'PICKUP' && order.status === 'DELIVERED' ? 'PICKED UP' : order.status} domain="order" />
        </View>
        <Divider />
        <View style={styles.kv}>
          <View style={styles.kvIcon}>
            <Ionicons name="cash-outline" size={18} color={colors.success} />
          </View>
          <Text style={styles.kvLabel}>Total</Text>
          <Text style={styles.kvValue}>{formatMoney(order.total_amount, order.currency)}</Text>
        </View>
        {formatShortDate(order.created_at) ? (
          <View style={styles.kv}>
            <View style={styles.kvIcon}>
              <Ionicons name="time-outline" size={18} color={colors.info} />
            </View>
            <Text style={styles.kvLabel}>Placed</Text>
            <Text style={styles.kvValue}>{formatShortDate(order.created_at)}</Text>
          </View>
        ) : null}
        {order.customer_type && order.customer_type !== 'RESTAURANT' ? (
          <>
            <Divider />
            <Text style={type.title}>{order.customer_type} · {order.requested_delivery_method}</Text>
            <Text style={styles.etaSub}>{order.customer_contact_snapshot?.name} · {order.customer_contact_snapshot?.phone}</Text>
            <Text style={styles.etaSub}>{order.customer_contact_snapshot?.email || 'No email'} · {order.checkout_payment_method?.replace(/_/g, ' ')}</Text>
            <Text style={styles.etaSub}>Subtotal {formatMoney(order.subtotal_amount || 0, order.currency)} · Delivery {formatMoney(order.delivery_fee || 0, order.currency)}</Text>
          </>
        ) : null}
        {next ? (
          <Button
            label={`Mark ${next.toLowerCase()}`}
            icon="arrow-forward-circle-outline"
            onPress={advance}
            loading={updateOrder.isPending}
            style={styles.cta}
          />
        ) : null}
      </Card>

      <SectionHeader>Items</SectionHeader>
      {(Array.isArray(order.items) ? order.items : []).map((item) => (
        <Card key={item.id}>
          <Text style={type.title}>{item.product_name ?? item.product_id}</Text>
          <Text style={styles.etaSub}>Ordered: {item.quantity}</Text>
          {['PLACED', 'PENDING_APPROVAL', 'ACKNOWLEDGED', 'PROCESSING'].includes(order.status) ? (
            <Button
              label={'Report unavailable'}
              variant={'outline'}
              loading={reportShortage.isPending}
              onPress={() => {
                Alert.alert(
                  'Report shortage',
                  'Tell the customer this entire line is unavailable?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Report',
                      style: 'destructive',
                      onPress: () => {
                        void reportShortage
                          .mutateAsync({
                            orderId: order.id,
                            orderItemId: item.id,
                            orderedQuantity: Number(item.quantity),
                          })
                          .catch((error) =>
                            Alert.alert(
                              'Error',
                              error instanceof Error ? error.message : 'Could not report shortage'
                            )
                          )
                      },
                    },
                  ]
                )
              }}
            />
          ) : null}
        </Card>
      ))}

      {(amendmentData?.amendments ?? []).length > 0 ? (
        <Card>
          <SectionHeader>Order changes</SectionHeader>
          {(amendmentData?.amendments ?? []).map((amendment) => (
            <View key={amendment.id} style={styles.amendment}>
              <Text style={type.title}>{amendment.description || 'Order change'}</Text>
              <Text style={styles.etaSub}>
                {amendmentChangeLabel(amendment)} · {amendment.status ?? 'unknown'}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {activeDelivery && tracking?.trackingEnabled ? (
        <Card>
          <SectionHeader>Live tracking</SectionHeader>
          <View style={styles.gpsRow}>
            <Ionicons name="radio-outline" size={16} color={colors.brand} />
            <Text style={styles.gpsLabel}>{getGpsStatusLabel(tracking.tracking)}</Text>
          </View>
          <Text style={styles.eta}>
            {getSupplierEtaPrimaryText(tracking) ?? getEtaUnavailableMessage(tracking)}
          </Text>
          <Text style={styles.etaSub}>{getSupplierEtaSecondaryText(tracking)}</Text>
          <View style={styles.mapWrap}>
            <DeliveryTrackingMap
              driverPoint={mapPoints.driverPoint}
              destinationPoint={mapPoints.destinationPoint}
              showDestinationPin
            />
          </View>
        </Card>
      ) : null}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: theme.spacing.md, gap: theme.spacing.xs },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: theme.spacing.sm },
  title: { ...type.h2, flex: 1 },
  kv: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, paddingVertical: 6 },
  kvIcon: {
    width: 32,
    height: 32,
    borderRadius: theme.radius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kvLabel: { ...type.label, flex: 1 },
  kvValue: { fontSize: 16, fontWeight: '700', color: colors.text },
  cta: { marginTop: theme.spacing.md },
  gpsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: theme.spacing.xs },
  gpsLabel: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  eta: { fontSize: 20, fontWeight: '800', color: colors.brand, letterSpacing: -0.3 },
  etaSub: { color: colors.textMuted, marginTop: 2, marginBottom: theme.spacing.sm, fontWeight: '500' },
  mapWrap: { borderRadius: theme.radius.md, overflow: 'hidden', marginTop: theme.spacing.xs },
  amendment: { paddingVertical: theme.spacing.xs },
})
