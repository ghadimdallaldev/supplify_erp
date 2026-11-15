import { useMemo } from 'react'
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps'
import { mapProvider } from '../../config/env'
import { colors, theme } from '../../theme'
import { fitViewToPoints, googleMapsSearchUrl, type MapPoint } from '../../utils/deliveryMapUtils'

type Props = {
  driverPoint?: MapPoint | null
  destinationPoint?: MapPoint | null
  showDestinationPin?: boolean
  height?: number
  onOpenMaps?: () => void
}

export function DeliveryTrackingMap({
  driverPoint,
  destinationPoint,
  showDestinationPin = false,
  height = 220,
  onOpenMaps,
}: Props) {
  const points = useMemo(() => {
    const result: MapPoint[] = []
    if (driverPoint) result.push(driverPoint)
    if (showDestinationPin && destinationPoint) result.push(destinationPoint)
    return result
  }, [driverPoint, destinationPoint, showDestinationPin])

  const region = useMemo(() => {
    const { center, delta } = fitViewToPoints(points)
    return {
      latitude: center.lat,
      longitude: center.lng,
      latitudeDelta: delta,
      longitudeDelta: delta,
    }
  }, [points])

  const destination = showDestinationPin ? destinationPoint : driverPoint
  const useNativeMap = mapProvider === 'native' || mapProvider === 'google'
  const openMaps = () => {
    if (onOpenMaps) {
      onOpenMaps()
      return
    }
    if (destination) {
      void Linking.openURL(googleMapsSearchUrl(destination.lat, destination.lng))
    }
  }

  return (
    <View style={[styles.wrap, { height }]}>
      {useNativeMap ? (
        <MapView style={StyleSheet.absoluteFill} provider={PROVIDER_DEFAULT} region={region}>
          {driverPoint ? (
            <Marker
              coordinate={{ latitude: driverPoint.lat, longitude: driverPoint.lng }}
              title="Driver"
              pinColor={colors.brand}
            />
          ) : null}
          {showDestinationPin && destinationPoint ? (
            <Marker
              coordinate={{ latitude: destinationPoint.lat, longitude: destinationPoint.lng }}
              title="Destination"
              pinColor={colors.success}
            />
          ) : null}
        </MapView>
      ) : (
        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>Location available</Text>
          <Text style={styles.placeholderText}>
            {destination
              ? 'Open the live location in your device map.'
              : 'Location not available yet.'}
          </Text>
        </View>
      )}
      {destination ? (
        <Pressable style={styles.recenter} onPress={openMaps} accessibilityRole="button">
          <Text style={styles.recenterText}>Open Maps</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    padding: theme.spacing.md,
  },
  placeholderTitle: { fontWeight: '800', color: colors.text, marginBottom: 4 },
  placeholderText: { color: colors.textMuted, textAlign: 'center' },
  recenter: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recenterText: { fontWeight: '600', color: colors.brand, fontSize: 13 },
})
