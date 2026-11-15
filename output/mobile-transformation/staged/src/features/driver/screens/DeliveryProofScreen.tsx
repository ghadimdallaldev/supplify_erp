import { Text, TextInput } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { DriverStackParamList } from "../../../navigation/DriverNavigator";
import {
  useCompleteDelivery,
  usePresignPod,
} from "../../../services/api/queries";
import {
  Button,
  Card,
  Screen,
  SectionHeader,
  ToastBanner,
} from "../../../components/ui";
import { colors, theme, type } from "../../../theme";
import {
  filenameForPodMime,
  isPodPhotoWithinSizeLimit,
  preparePodImage,
  PodUploadError,
  resolvePresignUploadUrl,
  uploadPreparedPodImage,
} from "../../../utils/podValidation";

type PickedPhoto = {
  uri: string;
  fileName: string;
  mimeType?: string | null;
  fileSize?: number;
};

type OptionalGps = {
  latitude?: number;
  longitude?: number;
  note?: string;
};

type FailureStage = "upload" | "completion" | null;

async function captureOptionalGps(enabled: boolean): Promise<OptionalGps> {
  if (!enabled) return {};
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== "granted") {
      return {
        note: "GPS permission is off. Delivery can still be confirmed without coordinates.",
      };
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const location = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }),
        new Promise<null>((resolve) => {
          timeout = setTimeout(() => resolve(null), 8_000);
        }),
      ]);
      if (!location) {
        return {
          note: "GPS took too long. Delivery can still be confirmed without coordinates.",
        };
      }
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  } catch {
    return {
      note: "GPS is unavailable. Delivery can still be confirmed without coordinates.",
    };
  }
}

export function DeliveryProofScreen() {
  useUiLocale();

  const { params } =
    useRoute<RouteProp<DriverStackParamList, "DeliveryProof">>();
  const navigation = useNavigation();
  const [recipient, setRecipient] = useState("");
  const [notes, setNotes] = useState("");
  const [signatureNote, setSignatureNote] = useState("");
  const [includeGps, setIncludeGps] = useState(true);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(null);
  const [failureStage, setFailureStage] = useState<FailureStage>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "confirming">(
    "idle",
  );

  const presignPod = usePresignPod();
  const completeDelivery = useCompleteDelivery();

  const pickPhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        uiCopy("Camera needed"),
        uiCopy("Allow camera access to capture proof of delivery."),
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    if (!isPodPhotoWithinSizeLimit(asset.fileSize)) {
      Alert.alert(
        uiCopy("Photo too large"),
        uiCopy("Please use a photo under 10 MB."),
      );
      return;
    }

    setPhoto({
      uri: asset.uri,
      fileName: asset.fileName ?? `pod-${Date.now()}.jpg`,
      mimeType: asset.mimeType,
      fileSize: asset.fileSize,
    });
    setUploadedFileKey(null);
    setFailureStage(null);
    setFailureMessage(null);
    setGpsMessage(null);
  };

  const confirm = async () => {
    if (!photo) {
      Alert.alert(
        uiCopy("Photo required"),
        uiCopy("Take a delivery photo before confirming."),
      );
      return;
    }
    if (!params.driverAssignmentId) {
      Alert.alert(
        uiCopy("Delivery unavailable"),
        uiCopy(
          "This stop has no active driver assignment. Return to the route and retry.",
        ),
      );
      return;
    }

    let reusableFileKey = uploadedFileKey;
    setFailureStage(null);
    setFailureMessage(null);
    setGpsMessage(null);
    try {
      if (!reusableFileKey) {
        setStage("uploading");
        const prepared = await preparePodImage(photo.uri, photo.mimeType);
        const presign = await presignPod.mutateAsync({
          orderId: params.orderId,
          fileName: filenameForPodMime(photo.fileName, prepared.mimeType),
          fileType: prepared.mimeType,
          fileSize: prepared.bytes,
        });
        const uploadUrl = resolvePresignUploadUrl(presign);
        if (!uploadUrl)
          throw new Error(
            "The upload service did not return a proof link. Please retry.",
          );
        await uploadPreparedPodImage(uploadUrl, prepared);
        reusableFileKey = presign.fileKey;
        setUploadedFileKey(reusableFileKey);
      }

      setStage("confirming");
      const gps = await captureOptionalGps(includeGps);
      if (gps.note) setGpsMessage(gps.note);
      const combinedNotes = [
        notes.trim(),
        signatureNote.trim() ? `Signature: ${signatureNote.trim()}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await completeDelivery.mutateAsync({
        orderId: params.orderId,
        recipient_name: recipient.trim() || undefined,
        notes: combinedNotes || undefined,
        file_key: reusableFileKey,
        driver_assignment_id: params.driverAssignmentId,
        warehouse_assignment_id: params.warehouseAssignmentId,
        latitude: gps.latitude,
        longitude: gps.longitude,
      });

      Alert.alert(
        uiCopy("Delivered"),
        gps.note
          ? uiCopy("Delivery confirmed with proof. GPS was not attached.")
          : uiCopy("Delivery confirmed with proof."),
      );
      navigation.goBack();
      navigation.goBack();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not confirm delivery.";
      if (
        error instanceof PodUploadError &&
        error.code === "UPLOAD_MALWARE_DETECTED"
      ) {
        setUploadedFileKey(null);
        setFailureStage("upload");
        setFailureMessage(message);
      } else if (reusableFileKey) {
        setFailureStage("completion");
        setFailureMessage(
          `Photo uploaded. ${message} Retry confirmation; the photo will not upload again.`,
        );
      } else {
        setFailureStage("upload");
        setFailureMessage(message);
      }
    } finally {
      setStage("idle");
    }
  };

  const busy =
    stage !== "idle" || presignPod.isPending || completeDelivery.isPending;
  const actionLabel = busy
    ? stage === "uploading"
      ? "Uploading proof..."
      : "Confirming delivery..."
    : failureStage === "completion"
      ? "Retry confirmation"
      : failureStage === "upload"
        ? "Retry photo upload"
        : "Confirm delivery";

  return (
    <Screen
      form
      title={uiCopy("Proof of delivery")}
      subtitle={params.restaurantName}
      scroll
    >
      {failureMessage ? (
        <ToastBanner message={failureMessage} tone="error" />
      ) : null}
      {gpsMessage ? <ToastBanner message={gpsMessage} tone="info" /> : null}

      <SectionHeader>{uiCopy("Delivery photo")}</SectionHeader>
      <Card>
        {photo ? (
          <Pressable
            onPress={pickPhoto}
            accessibilityRole="button"
            accessibilityLabel={uiCopy("Retake delivery photo")}
          >
            <Image
              source={{ uri: photo.uri }}
              style={styles.preview}
              resizeMode="cover"
            />
            <Text style={styles.retake}>{uiCopy("Tap to retake")}</Text>
          </Pressable>
        ) : (
          <Button
            label={uiCopy("Take photo")}
            icon="camera-outline"
            onPress={pickPhoto}
          />
        )}
        <Text style={styles.hint}>
          {uiCopy("JPEG, PNG, or WebP - max 10 MB")}
        </Text>
      </Card>

      <SectionHeader>{uiCopy("Delivery details")}</SectionHeader>
      <Card>
        <Text style={styles.fieldLabel}>{uiCopy("Recipient name")}</Text>
        <TextInput
          placeholder={uiCopy("Who received the order?")}
          value={recipient}
          onChangeText={setRecipient}
          style={styles.input}
          autoCapitalize="words"
          maxLength={160}
        />
        <Text style={styles.fieldLabel}>{uiCopy("Note (optional)")}</Text>
        <TextInput
          placeholder={uiCopy("Drop-off instructions, gate code, etc.")}
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, styles.multiline]}
          multiline
          maxLength={1_000}
        />
        <Text style={styles.fieldLabel}>
          {uiCopy("Signature note (optional)")}
        </Text>
        <TextInput
          placeholder={uiCopy("e.g. Signed by manager")}
          value={signatureNote}
          onChangeText={setSignatureNote}
          style={styles.input}
          maxLength={160}
        />
      </Card>

      <Card>
        <View style={styles.toggleRow}>
          <View style={styles.flex}>
            <Text style={type.title}>{uiCopy("Include GPS location")}</Text>
            <Text style={type.label}>
              {uiCopy("Optional - confirmation is never blocked by location")}
            </Text>
          </View>
          <Switch
            value={includeGps}
            onValueChange={setIncludeGps}
            trackColor={{ false: colors.borderStrong, true: colors.brandLight }}
            thumbColor={includeGps ? colors.brand : colors.surface}
          />
        </View>
      </Card>

      <Button
        label={actionLabel}
        variant="success"
        icon="checkmark-circle-outline"
        onPress={confirm}
        disabled={busy || !photo}
        loading={busy}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fieldLabel: { ...type.label, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    padding: 12,
    marginBottom: 12,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.text,
  },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  preview: {
    width: "100%",
    height: 200,
    borderRadius: theme.radius.md,
    marginBottom: 8,
    backgroundColor: colors.backgroundAlt,
  },
  retake: { ...type.label, textAlign: "center", color: colors.brand },
  hint: { ...type.caption, marginTop: 8 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.md,
  },
});
