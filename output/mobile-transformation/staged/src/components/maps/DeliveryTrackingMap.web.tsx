import { Text } from "../ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../i18n";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { colors, theme } from "../../theme";
import {
  googleMapsSearchUrl,
  type MapPoint,
} from "../../utils/deliveryMapUtils";

type Props = {
  driverPoint?: MapPoint | null;
  destinationPoint?: MapPoint | null;
  showDestinationPin?: boolean;
  height?: number;
  onOpenMaps?: () => void;
};

export function DeliveryTrackingMap({
  driverPoint,
  destinationPoint,
  showDestinationPin = false,
  height = 220,
  onOpenMaps,
}: Props) {
  useUiLocale();

  const openMaps = () => {
    if (onOpenMaps) {
      onOpenMaps();
      return;
    }
    const dest = showDestinationPin ? destinationPoint : driverPoint;
    if (dest) Linking.openURL(googleMapsSearchUrl(dest.lat, dest.lng));
  };

  const hasPoint = Boolean(showDestinationPin ? destinationPoint : driverPoint);

  return (
    <View style={[styles.wrap, { height }]}>
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          {hasPoint
            ? uiCopy("Live map is available in the iOS and Android app.")
            : uiCopy("Location not available yet.")}
        </Text>
      </View>
      {hasPoint ? (
        <Pressable style={styles.recenter} onPress={openMaps}>
          <Text style={styles.recenterText}>{uiCopy("Open Maps")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    padding: theme.spacing.md,
  },
  placeholderText: { color: colors.textMuted, textAlign: "center" },
  recenter: {
    position: "absolute",
    bottom: 10,
    right: 10,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  recenterText: { fontWeight: "600", color: colors.brand, fontSize: 13 },
});
