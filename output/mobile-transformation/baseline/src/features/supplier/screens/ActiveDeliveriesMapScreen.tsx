import { useMemo } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import MapView, { Marker } from 'react-native-maps'
import { useSupplierDeliveryBoard } from '../../../services/api/queries'
import { mapProvider } from '../../../config/env'
import { fitViewToPoints, googleMapsSearchUrl, toMapPoint } from '../../../utils/deliveryMapUtils'
import { getGpsStatusLabel } from '../../../utils/deliveryEtaDisplay'
import { Card, EmptyState, FlashList, LoadingState } from '../../../components/ui'
import { colors, theme } from '../../../theme'

export function ActiveDeliveriesMapScreen() {
  const { data, isLoading, isRefetching, refetch } = useSupplierDeliveryBoard()
  const orders = data?.orders ?? []
  const useNativeMap = mapProvider === 'native' || mapProvider === 'google'

  const points = useMemo(
    () =>
      orders
        .map((order) =>
          toMapPoint(
            order.tracking?.latestLocation?.latitude ?? order.destinationLatitude,
            order.tracking?.latestLocation?.longitude ?? order.destinationLongitude
          )
        )
        .filter(Boolean) as { lat: number; lng: number }[],
    [orders]
  )

  const region = useMemo(() => {
    const { center, delta } = fitViewToPoints(points)
    return {
      latitude: center.lat,
      longitude: center.lng,
      latitudeDelta: delta,
      longitudeDelta: delta,
    }
  }, [points])

  const live = orders.filter(
    (order) => order.tracking?.hasLocation && !order.tracking?.isStale
  ).length
  const stale = orders.filter(
    (order) => order.tracking?.hasLocation && order.tracking?.isStale
  ).length
  const noGps = orders.length - live - stale

  if (isLoading) return <LoadingState />

  return (
    <View style={styles.container}>
      <Text style={styles.summary}>
        Live {live} · Not updating {stale} · No location {noGps}
      </Text>
      {useNativeMap ? (
        <MapView style={styles.map} region={region}>
          {orders.map((order) => {
            const point = toMapPoint(
              order.tracking?.latestLocation?.latitude ?? order.destinationLatitude,
              order.tracking?.latestLocation?.longitude ?? order.destinationLongitude
            )
            if (!point) return null
            return (
              <Marker
                key={order.orderId}
                coordinate={{ latitude: point.lat, longitude: point.lng }}
                title={order.restaurantName}
              />
            )
          })}
        </MapView>
      ) : (
        <View style={styles.mapFallback}>
          <Ionicons name="map-outline" size={34} color={colors.brand} />
          <Text style={styles.mapFallbackTitle}>Delivery locations are ready</Text>
          <Text style={styles.mapFallbackText}>
            Open any delivery below in your device map. This safe mode avoids native-map crashes.
          </Text>
        </View>
      )}
      <FlashList
        data={orders}
        keyExtractor={(item) => item.orderId}
        contentContainerStyle={styles.list}
        refreshing={isRefetching}
        onRefresh={() => void refetch()}
        ListEmptyComponent={
          <EmptyState
            icon="navigate-outline"
            title="No active deliveries"
            message="Deliveries in progress will appear here."
          />
        }
        renderItem={({ item }) => {
          const point = toMapPoint(
            item.tracking?.latestLocation?.latitude ?? item.destinationLatitude,
            item.tracking?.latestLocation?.longitude ?? item.destinationLongitude
          )
          return (
            <Card>
              <View style={styles.deliveryRow}>
                <View style={styles.deliveryText}>
                  <Text style={styles.name}>{item.restaurantName}</Text>
                  <Text style={styles.meta}>{getGpsStatusLabel(item.tracking)}</Text>
                </View>
                {point ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.restaurantName} in maps`}
                    onPress={() => void Linking.openURL(googleMapsSearchUrl(point.lat, point.lng))}
                    style={styles.openButton}
                  >
                    <Ionicons name="navigate" size={17} color={colors.brand} />
                    <Text style={styles.openButtonText}>Open map</Text>
                  </Pressable>
                ) : null}
              </View>
            </Card>
          )
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  summary: { padding: theme.spacing.md, fontWeight: '600', color: colors.text },
  map: { height: 240 },
  mapFallback: {
    minHeight: 190,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
    marginHorizontal: theme.spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.lg,
    backgroundColor: colors.surface,
  },
  mapFallbackTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  mapFallbackText: { color: colors.textMuted, textAlign: 'center', maxWidth: 320 },
  list: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  deliveryRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  deliveryText: { flex: 1, minWidth: 0 },
  name: { fontWeight: '700', color: colors.text },
  meta: { color: colors.textMuted, marginTop: 4 },
  openButton: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: theme.radius.md,
  },
  openButtonText: { color: colors.brand, fontWeight: '700', fontSize: 12 },
})
