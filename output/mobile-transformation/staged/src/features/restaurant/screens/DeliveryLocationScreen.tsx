import { Text, TextInput } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useEffect, useState } from "react";
import { Alert, ScrollView, StyleSheet } from "react-native";
import * as Location from "expo-location";
import {
  useDeliveryLocations,
  useUpdateDeliveryLocation,
} from "../../../services/api/queries";
import { Button, Card, LoadingState } from "../../../components/ui";
import { colors, theme, type } from "../../../theme";

export function DeliveryLocationScreen() {
  useUiLocale();

  const { data, isLoading } = useDeliveryLocations();
  const update = useUpdateDeliveryLocation();
  // The API returns the restaurant-level pin plus its branches; this screen edits the
  // restaurant pin, which is the fallback destination for every order without branch coords.
  const primary = data?.restaurant ?? null;

  const [label, setLabel] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [notes, setNotes] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (isLoading || hydrated) return;
    setLabel(primary?.deliveryLocationLabel ?? "");
    setLat(
      primary?.deliveryLatitude != null ? String(primary.deliveryLatitude) : "",
    );
    setLng(
      primary?.deliveryLongitude != null
        ? String(primary.deliveryLongitude)
        : "",
    );
    setNotes(primary?.deliveryAddressNotes ?? "");
    setHydrated(true);
  }, [hydrated, isLoading, primary]);

  if (isLoading) return <LoadingState />;

  const useCurrentLocation = async () => {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          uiCopy("Location permission needed"),
          uiCopy(
            "Allow foreground location access to set the delivery pin automatically.",
          ),
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLat(position.coords.latitude.toFixed(6));
      setLng(position.coords.longitude.toFixed(6));
      if (!label.trim()) setLabel("Main delivery location");
    } catch (error) {
      Alert.alert(
        uiCopy("Could not get location"),
        error instanceof Error
          ? error.message
          : uiCopy("Check location services and try again."),
      );
    } finally {
      setLocating(false);
    }
  };

  const save = async () => {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      Alert.alert(
        uiCopy("Check the location"),
        uiCopy("Choose your current location or enter valid coordinates."),
      );
      return;
    }
    try {
      await update.mutateAsync({
        deliveryLatitude: latitude,
        deliveryLongitude: longitude,
        deliveryLocationLabel: label.trim() || null,
        deliveryAddressNotes: notes.trim() || null,
      });
      Alert.alert(
        uiCopy("Location saved"),
        uiCopy("Drivers and delivery estimates will use this pin."),
      );
    } catch (error) {
      Alert.alert(
        uiCopy("Could not save"),
        error instanceof Error ? error.message : uiCopy("Please try again."),
      );
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Card>
        <Text style={styles.help}>
          {uiCopy(
            "Set the entrance drivers should use. Your pin powers navigation and delivery estimates.",
          )}
        </Text>
        <Button
          label={uiCopy("Use my current location")}
          icon="locate-outline"
          variant="outline"
          onPress={() => void useCurrentLocation()}
          loading={locating}
          disabled={locating || update.isPending}
          style={styles.locateButton}
        />

        <Text style={styles.fieldLabel}>{uiCopy("Location name")}</Text>
        <TextInput
          accessibilityLabel={uiCopy("Location name")}
          placeholder={uiCopy("For example: Main kitchen entrance")}
          placeholderTextColor={colors.textFaint}
          value={label}
          onChangeText={setLabel}
          style={styles.input}
        />

        <Text style={styles.fieldLabel}>{uiCopy("Latitude")}</Text>
        <TextInput
          accessibilityLabel={uiCopy("Latitude")}
          placeholder="33.893800"
          placeholderTextColor={colors.textFaint}
          value={lat}
          onChangeText={setLat}
          style={styles.input}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>{uiCopy("Longitude")}</Text>
        <TextInput
          accessibilityLabel={uiCopy("Longitude")}
          placeholder="35.501800"
          placeholderTextColor={colors.textFaint}
          value={lng}
          onChangeText={setLng}
          style={styles.input}
          keyboardType="numbers-and-punctuation"
          autoCapitalize="none"
        />

        <Text style={styles.fieldLabel}>{uiCopy("Driver notes")}</Text>
        <TextInput
          accessibilityLabel={uiCopy("Driver notes")}
          placeholder={uiCopy(
            "Gate, floor, loading entrance, or contact instructions",
          )}
          placeholderTextColor={colors.textFaint}
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, styles.multiline]}
          multiline
        />
      </Card>
      <Button
        label={uiCopy("Save delivery location")}
        icon="checkmark-outline"
        onPress={() => void save()}
        loading={update.isPending}
        disabled={update.isPending || locating}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: theme.spacing.md, gap: theme.spacing.md },
  help: {
    color: colors.textMuted,
    marginBottom: theme.spacing.md,
    lineHeight: 20,
  },
  locateButton: { marginBottom: theme.spacing.lg },
  fieldLabel: { ...type.label, color: colors.text, marginBottom: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    marginBottom: theme.spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
  },
  multiline: { minHeight: 88, paddingTop: 12, textAlignVertical: "top" },
});
