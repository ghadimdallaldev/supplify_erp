import { Alert, Linking, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native'
import { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { DriverStackParamList } from '../../../navigation/DriverNavigator'
import { useDriverBoard, useDriverDetail, useUpdateDeliveryStatus } from '../../../services/api/queries'
import { useDriverGpsTracking } from '../../../hooks/useDriverGpsTracking'
import { Button, ListSkeleton, Screen, StatusPill } from '../../../components/ui'
import {
  getDriverGpsBannerLabel,
  getMobileDriverActions,
  isTerminalDriverDeliveryStatus,
} from '../../../utils/driverDeliveryUi'
import { googleMapsSearchQuery, googleMapsSearchUrl, isValidCoord } from '../../../utils/deliveryMapUtils'
import { formatOrderRef } from '../../../utils/format'
import { colors, theme, type } from '../../../theme'

export function DriverStopScreen() {
  const { params } = useRoute<RouteProp<DriverStackParamList, 'DriverStop'>>()
  const navigation = useNavigation<NativeStackNavigationProp<DriverStackParamList>>()
  const insets = useSafeAreaInsets()
  const { data, isLoading } = useDriverBoard()
  const { data: detail } = useDriverDetail(params.orderId)
  const updateStatus = useUpdateDeliveryStatus()

  const order = data?.orders.find((o) => o.orderId === params.orderId)
  const driverAssignmentId = params.driverAssignmentId ?? order?.assignmentId ?? undefined

  const trackable =
    order && !isTerminalDriverDeliveryStatus(order.deliveryStatus)
      ? [{ orderId: order.orderId, deliveryStatus: order.deliveryStatus }]
      : []

  const { trackingActive, permissionDenied, gpsMessage, trackableCount } =
    useDriverGpsTracking(trackable)

  const gpsError = gpsMessage === 'Location not updating'
  const gpsBanner = getDriverGpsBannerLabel({
    trackableCount,
    trackingActive,
    permissionDenied,
    gpsError,
  })

  if (isLoading) return <ListSkeleton rows={4} avatar={false} />
  if (!order) {
    return (
      <Screen title="Delivery" scroll>
        <Text style={type.body}>Delivery not found.</Text>
      </Screen>
    )
  }

  const actions = getMobileDriverActions(order.deliveryStatus)
  const destination = detail?.destination
  const hasCoordinates = isValidCoord(destination?.latitude, destination?.longitude)
  const fallbackLabel = destination?.label || (typeof destination?.address === 'string' ? destination.address : order.deliveryArea || order.restaurantName)
  const mapsUrl = hasCoordinates ? googleMapsSearchUrl(Number(destination?.latitude), Number(destination?.longitude)) : (fallbackLabel && fallbackLabel.toLowerCase() !== 'unassigned area' ? googleMapsSearchQuery(fallbackLabel) : null)

  const handleAction = async (status: 'out_for_delivery' | 'delivered' | 'failed') => {
    if (status === 'delivered') {
      navigation.navigate('DeliveryProof', {
        orderId: order.orderId,
        restaurantName: order.restaurantName,
        driverAssignmentId,
        warehouseAssignmentId: order.warehouseAssignmentId ?? undefined,
      })
      return
    }
    if (status === 'failed') {
      navigation.navigate('ProblemReport', {
        orderId: order.orderId,
        restaurantName: order.restaurantName,
        driverAssignmentId,
        warehouseAssignmentId: order.warehouseAssignmentId ?? undefined,
      })
      return
    }
    try {
      await updateStatus.mutateAsync({
        orderId: order.orderId,
        status,
        driver_assignment_id: driverAssignmentId,
        warehouse_assignment_id: order.warehouseAssignmentId ?? undefined,
      })
      Alert.alert('Updated', 'Status saved.')
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not update')
    }
  }

  return (
    <View style={styles.root}>
      <Screen scroll padded contentStyle={styles.scrollPad}>
        {gpsBanner ? (
          <View
            style={[
              styles.gpsBanner,
              permissionDenied || gpsError ? styles.gpsBannerError : styles.gpsBannerOk,
            ]}
          >
            <Ionicons
              name={permissionDenied || gpsError ? 'location-outline' : 'navigate-outline'}
              size={16}
              color={permissionDenied || gpsError ? colors.danger : colors.brand}
            />
            <Text
              style={[
                styles.gpsBannerText,
                { color: permissionDenied || gpsError ? colors.danger : colors.brand },
              ]}
            >
              {gpsBanner}
            </Text>
          </View>
        ) : null}

        <View style={styles.block}>
          <View style={styles.headRow}>
            <Text style={styles.restaurant}>{order.restaurantName}</Text>
            <StatusPill status={order.deliveryStatus} domain="delivery" />
          </View>
          <Text style={styles.address}>
            {destination?.label ?? order.deliveryArea ?? 'Delivery area not set'}
          </Text>
          <Text style={styles.orderRef}>
            {formatOrderRef(detail?.orderReference ?? order.orderId)}
            {detail?.route?.sequenceNumber != null ? ` · Stop ${detail.route.sequenceNumber}` : ''}
            {detail?.deliveryWindow ? ` · ${detail.deliveryWindow}` : ''}
          </Text>

          {mapsUrl ? (
            <Button
              label="Navigate"
              icon="navigate-outline"
              style={styles.navBtn}
              onPress={() => Linking.openURL(mapsUrl)}
            />
          ) : (
            <Text style={styles.warning}>No usable delivery address is available.</Text>
          )}
        </View>

        {destination?.addressNotes ? (
          <View style={styles.instructions}>
            <Text style={type.overline}>Delivery instructions</Text>
            <Text style={styles.instructionsText}>{destination.addressNotes}</Text>
          </View>
        ) : null}

        {detail?.items?.length ? (
          <View style={styles.block}>
            <Text style={styles.blockLabel}>
              Items{order.itemCount != null ? ` · ${order.itemCount}` : ''}
            </Text>
            {detail.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={styles.itemText}>
                  <Text style={type.body} numberOfLines={2}>
                    {item.name}
                  </Text>
                  {item.sku ? <Text style={type.caption}>{item.sku}</Text> : null}
                </View>
                <Text style={styles.itemQty}>×{item.quantity}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {detail?.notes ? (
          <View style={styles.instructions}>
            <Text style={type.overline}>Notes</Text>
            <Text style={styles.instructionsText}>{detail.notes}</Text>
          </View>
        ) : null}
      </Screen>

      {actions.length > 0 ? (
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + theme.spacing.md }]}>
          {actions.map((action) => (
            <Button
              key={action.status}
              label={action.label}
              variant={
                action.status === 'delivered'
                  ? 'success'
                  : action.status === 'failed'
                    ? 'danger'
                    : 'primary'
              }
              icon={
                action.status === 'delivered'
                  ? 'checkmark-circle-outline'
                  : action.status === 'failed'
                    ? 'alert-circle-outline'
                    : 'car-outline'
              }
              loading={updateStatus.isPending && action.status === 'out_for_delivery'}
              disabled={updateStatus.isPending}
              onPress={() => handleAction(action.status)}
            />
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scrollPad: { paddingBottom: theme.spacing.xl },
  gpsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hairline,
    marginBottom: theme.spacing.sm,
  },
  gpsBannerOk: { backgroundColor: colors.brandLight, borderColor: colors.brandBorder },
  gpsBannerError: { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder },
  gpsBannerText: { fontWeight: '600', flex: 1 },

  block: {
    backgroundColor: colors.surface,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hairline,
    borderColor: colors.border,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  blockLabel: { ...type.overline, marginBottom: theme.spacing.sm },
  headRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  restaurant: { fontSize: 22, fontWeight: '700', color: colors.text, flex: 1, letterSpacing: -0.3 },
  address: { ...type.body, color: colors.textMuted, marginTop: theme.spacing.xs },
  orderRef: { ...type.caption, marginTop: theme.spacing.xs },
  navBtn: { marginTop: theme.spacing.lg },
  warning: { ...type.label, color: colors.warning, marginTop: theme.spacing.md },

  instructions: {
    backgroundColor: colors.warningBg,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hairline,
    borderColor: colors.warningBorder,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  instructionsText: { ...type.body, color: colors.text },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: theme.hairline,
    borderTopColor: colors.separator,
  },
  itemText: { flex: 1, minWidth: 0 },
  itemQty: { ...type.title, color: colors.text },

  bottomBar: {
    paddingHorizontal: theme.gutter,
    paddingTop: theme.spacing.md,
    gap: theme.spacing.sm,
    borderTopWidth: theme.hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
})
