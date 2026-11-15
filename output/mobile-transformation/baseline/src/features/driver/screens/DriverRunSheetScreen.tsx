import { useMemo } from 'react'
import { StyleSheet } from 'react-native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useNavigation } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { DriverStackParamList } from '../../../navigation/DriverNavigator'
import { useDriverActiveRoute, useDriverBoard } from '../../../services/api/queries'
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Metric,
  OperationalRow,
  Screen,
  SectionHeader,
} from '../../../components/ui'
import { MetricStrip } from '../../../components/layout/HomeChrome'
import { formatDeliveryStatusLabel } from '../../../utils/driverDeliveryUi'
import { theme } from '../../../theme'

const EN_ROUTE = ['out_for_delivery', 'picked_up']
const CLOSED = ['delivered', 'failed', 'rescheduled']

/** The driver's own run sheet: only the stops assigned to them, nothing supplier-side. */
export function DriverRunSheetScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<DriverStackParamList>>()
  const insets = useSafeAreaInsets()
  const board = useDriverBoard()
  const routeQuery = useDriverActiveRoute()

  const orders = board.data?.orders ?? []
  const route = routeQuery.data?.route ?? null

  const counts = useMemo(() => {
    const status = (s: unknown) => String(s).toLowerCase()
    return {
      waiting: orders.filter((o) => !CLOSED.includes(status(o.deliveryStatus)) && !EN_ROUTE.includes(status(o.deliveryStatus))).length,
      enRoute: orders.filter((o) => EN_ROUTE.includes(status(o.deliveryStatus))).length,
      delivered: orders.filter((o) => status(o.deliveryStatus) === 'delivered').length,
      failed: orders.filter((o) => ['failed', 'rescheduled'].includes(status(o.deliveryStatus))).length,
    }
  }, [orders])

  if (board.isLoading) return <LoadingState message="Loading run sheet…" />
  if (board.isError) {
    return (
      <Screen title="Run sheet" padded>
        <ErrorState message="Check your connection and try again." onRetry={() => void board.refetch()} />
      </Screen>
    )
  }

  const subtitle = route?.scheduledDate ?? new Date().toISOString().slice(0, 10)

  return (
    <Screen
      title="Run sheet"
      subtitle={subtitle}
      scroll
      contentStyle={{ paddingBottom: insets.bottom + theme.spacing.lg }}
    >
      <MetricStrip>
        <Metric value={counts.waiting} label="Waiting" />
        <Metric value={counts.enRoute} label="En route" />
        <Metric value={counts.delivered} label="Delivered" />
        {counts.failed > 0 ? <Metric value={counts.failed} label="Issues" /> : null}
      </MetricStrip>

      {orders.length === 0 ? (
        <EmptyState
          icon="checkmark-done-outline"
          title="Nothing on your run sheet"
          message="Assigned stops will appear here."
        />
      ) : (
        <>
          <SectionHeader>
            {route ? `Stops · ${route.stops.length} on route` : `Stops · ${orders.length}`}
          </SectionHeader>
          <Card elevated={false} style={styles.list}>
            {orders.map((order) => (
              <OperationalRow
                key={order.assignmentId ?? order.orderId}
                title={order.restaurantName}
                subtitle={order.deliveryArea ?? undefined}
                note={formatDeliveryStatusLabel(order.deliveryStatus)}
                status={order.deliveryStatus}
                domain="delivery"
                avatarLabel={order.restaurantName}
                onPress={() =>
                  navigation.navigate('DriverStop', {
                    orderId: order.orderId,
                    driverAssignmentId: order.assignmentId ?? undefined,
                  })
                }
              />
            ))}
          </Card>
        </>
      )}
    </Screen>
  )
}

const styles = StyleSheet.create({
  list: { padding: 0, overflow: 'hidden' },
})
