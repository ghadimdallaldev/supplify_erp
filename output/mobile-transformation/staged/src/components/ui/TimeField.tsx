import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text, TextInput } from "./primitives";
import { Button } from "./index";
import { Sheet } from "./Sheet";
import { colors, type } from "../../theme";
import { copy, useAppLocale } from "../../i18n";

export function isTimeValue(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function TimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  useAppLocale();
  const [open, setOpen] = useState(false);
  const [hour, setHour] = useState(18);
  const [minute, setMinute] = useState(0);
  const show = () => {
    const valid = isTimeValue(value) ? value : "18:00";
    setHour(Number(valid.slice(0, 2)));
    setMinute(Number(valid.slice(3)));
    setOpen(true);
  };
  return (
    <View style={styles.field}>
      <Text style={type.label}>{copy("Time")}</Text>
      <View style={styles.control}>
        <TextInput
          value={value}
          onChangeText={onChange}
          accessibilityLabel={copy("Time")}
          placeholder="HH:mm"
          style={styles.input}
          keyboardType="numbers-and-punctuation"
        />
        <Pressable
          style={styles.icon}
          accessibilityRole="button"
          accessibilityLabel={copy("Choose time")}
          onPress={show}
        >
          <Ionicons name="time-outline" size={20} color={colors.brand} />
        </Pressable>
      </View>
      {value && !isTimeValue(value) ? (
        <Text style={styles.error}>{copy("Use HH:mm format.")}</Text>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={copy("Time")}>
        <View style={styles.picker}>
          <View style={styles.column}>
            <Text style={type.label}>{copy("Hour")}</Text>
            <Button
              label="+"
              variant="outline"
              onPress={() => setHour((hour + 1) % 24)}
            />
            <Text style={styles.number}>{String(hour).padStart(2, "0")}</Text>
            <Button
              label="−"
              variant="outline"
              onPress={() => setHour((hour + 23) % 24)}
            />
          </View>
          <Text style={styles.number}>:</Text>
          <View style={styles.column}>
            <Text style={type.label}>{copy("Minute")}</Text>
            <Button
              label="+"
              variant="outline"
              onPress={() => setMinute((minute + 5) % 60)}
            />
            <Text style={styles.number}>{String(minute).padStart(2, "0")}</Text>
            <Button
              label="−"
              variant="outline"
              onPress={() => setMinute((minute + 55) % 60)}
            />
          </View>
        </View>
        <Button
          label={copy("Use time")}
          onPress={() => {
            onChange(
              String(hour).padStart(2, "0") +
                ":" +
                String(minute).padStart(2, "0"),
            );
            setOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}
const styles = StyleSheet.create({
  field: { gap: 6 },
  control: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    borderRadius: 10,
  },
  input: { flex: 1, minWidth: 0, borderWidth: 0 },
  icon: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    paddingVertical: 16,
  },
  column: { alignItems: "center", gap: 12 },
  number: {
    fontSize: 32,
    lineHeight: 40,
    fontVariant: ["tabular-nums"],
    fontWeight: "600",
  },
  error: { ...type.caption, color: colors.danger },
});
