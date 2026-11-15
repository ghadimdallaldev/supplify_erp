import { TimeField, isTimeValue } from "../../../../components/ui/TimeField";
import { Text, TextInput } from "../../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../../i18n";
import { DateField, parseDateKey } from "../../../../components/ui/DateField";
import { useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RestaurantStackParamList } from "../../../../navigation/RestaurantNavigator";
import { useCreateReservation } from "../../../../services/api/queries";
import { usePermissions } from "../../../../hooks/usePermissions";
import {
  Button,
  EmptyState,
  Screen,
  SectionHeader,
} from "../../../../components/ui";
import { colors, theme, type } from "../../../../theme";

const DEFAULT_DURATION = 90;

function defaultScheduledAt(): string {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return date.toISOString();
}

function formatDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CreateReservationScreen() {
  useUiLocale();

  const navigation =
    useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>();
  const { canAny } = usePermissions();
  const canCreate = canAny(
    "RESERVATIONS_CREATE",
    "RESERVATIONS_EDIT",
    "RESERVATIONS_MANAGE",
  );
  const createReservation = useCreateReservation();

  const initialScheduled = useMemo(() => defaultScheduledAt(), []);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [scheduledInput, setScheduledInput] = useState(
    formatDatetimeLocal(initialScheduled),
  );
  const [durationMinutes, setDurationMinutes] = useState(
    String(DEFAULT_DURATION),
  );
  const [notes, setNotes] = useState("");

  if (!canCreate) {
    return (
      <Screen form title={uiCopy("New reservation")} scroll>
        <EmptyState
          icon="calendar-outline"
          title={uiCopy("Access restricted")}
          message={uiCopy("You do not have permission to create reservations.")}
        />
        <Button
          label={uiCopy("Go back")}
          variant="outline"
          onPress={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  const submit = async () => {
    const name = customerName.trim();
    if (!name) {
      Alert.alert(
        uiCopy("Guest name required"),
        uiCopy("Enter the guest name before saving."),
      );
      return;
    }

    const size = Number(partySize);
    if (!Number.isInteger(size) || size < 1) {
      Alert.alert(
        uiCopy("Check party size"),
        uiCopy("Party size must be at least 1."),
      );
      return;
    }

    const duration = Number(durationMinutes);
    if (!Number.isInteger(duration) || duration < 30) {
      Alert.alert(
        uiCopy("Check duration"),
        uiCopy("Duration must be at least 30 minutes."),
      );
      return;
    }

    if (
      !parseDateKey(scheduledInput.slice(0, 10)) ||
      !isTimeValue(scheduledInput.slice(11))
    ) {
      Alert.alert(
        uiCopy("Check date and time"),
        uiCopy("Choose a valid date and time."),
      );
      return;
    }
    const scheduledAt = new Date(
      scheduledInput.includes("T") ? scheduledInput : `${scheduledInput}:00`,
    );
    if (Number.isNaN(scheduledAt.getTime())) {
      Alert.alert(
        uiCopy("Check date and time"),
        uiCopy("Use YYYY-MM-DDTHH:mm format."),
      );
      return;
    }

    try {
      await createReservation.mutateAsync({
        customerName: name,
        customerPhone: customerPhone.trim() || undefined,
        partySize: size,
        scheduledAt: scheduledAt.toISOString(),
        durationMinutes: duration,
        notes: notes.trim() || undefined,
        bookingSource: "staff",
      });
      navigation.goBack();
    } catch (error) {
      Alert.alert(
        uiCopy("Could not create reservation"),
        error instanceof Error ? error.message : uiCopy("Try again."),
      );
    }
  };

  return (
    <Screen
      form
      title={uiCopy("New reservation")}
      subtitle={uiCopy("Host desk booking")}
      scroll
    >
      <SectionHeader>{uiCopy("Guest")}</SectionHeader>
      <View style={styles.field}>
        <Text style={type.label}>{uiCopy("Name")}</Text>
        <TextInput
          value={customerName}
          onChangeText={setCustomerName}
          placeholder={uiCopy("Guest name")}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          autoCapitalize="words"
        />
      </View>
      <View style={styles.field}>
        <Text style={type.label}>{uiCopy("Phone")}</Text>
        <TextInput
          value={customerPhone}
          onChangeText={setCustomerPhone}
          placeholder={uiCopy("Optional")}
          placeholderTextColor={colors.textFaint}
          style={styles.input}
          keyboardType="phone-pad"
        />
      </View>

      <SectionHeader>{uiCopy("Booking")}</SectionHeader>
      <View style={styles.field}>
        <Text style={type.label}>{uiCopy("Party size")}</Text>
        <TextInput
          value={partySize}
          onChangeText={setPartySize}
          keyboardType="number-pad"
          style={styles.input}
        />
      </View>
      <View style={styles.field}>
        <DateField
          value={scheduledInput.slice(0, 10)}
          onChange={(value) =>
            setScheduledInput(value + "T" + scheduledInput.slice(11))
          }
        />
      </View>
      <View style={styles.field}>
        <TimeField
          value={scheduledInput.slice(11)}
          onChange={(value) =>
            setScheduledInput(scheduledInput.slice(0, 10) + "T" + value)
          }
        />
      </View>
      <View style={styles.field}>
        <Text style={type.label}>{uiCopy("Duration (minutes)")}</Text>
        <TextInput
          value={durationMinutes}
          onChangeText={setDurationMinutes}
          keyboardType="number-pad"
          style={styles.input}
        />
      </View>
      <View style={styles.field}>
        <Text style={type.label}>{uiCopy("Notes")}</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder={uiCopy("Allergies, occasion, seating preference…")}
          placeholderTextColor={colors.textFaint}
          style={[styles.input, styles.notes]}
          multiline
        />
      </View>

      <Button
        label={uiCopy("Create reservation")}
        icon="checkmark-outline"
        loading={createReservation.isPending}
        onPress={() => void submit()}
        style={styles.submit}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: theme.spacing.md },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: colors.surface,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
  },
  notes: { minHeight: 88, textAlignVertical: "top" },
  submit: { marginTop: theme.spacing.sm },
});
