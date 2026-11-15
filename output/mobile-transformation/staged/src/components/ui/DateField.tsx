import { copy as uiCopy, useAppLocale as useUiLocale } from "../../i18n";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Sheet } from "./Sheet";
import { Text, TextInput } from "./primitives";
import { colors, type } from "../../theme";
import { copy, useAppLocale } from "../../i18n";
import { useAdaptiveLayout } from "../../theme/responsive";

export function localDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function parseDateKey(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12);
  return localDateKey(date) === value ? date : null;
}
export function DateField({
  value,
  onChange,
  label = "Date",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  useUiLocale();

  const locale = useAppLocale();
  const { width } = useAdaptiveLayout();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => parseDateKey(value) ?? new Date());
  const days = useMemo(
    () =>
      Array.from(
        {
          length: new Date(
            month.getFullYear(),
            month.getMonth() + 1,
            0,
          ).getDate(),
        },
        (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1, 12),
      ),
    [month],
  );
  const select = (date: Date) => {
    onChange(localDateKey(date));
    setOpen(false);
  };
  return (
    <View style={styles.field}>
      <Text style={type.label}>{copy(label)}</Text>
      <View style={styles.control}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          accessibilityLabel={copy(label)}
          style={styles.input}
          keyboardType="numbers-and-punctuation"
        />
        <Pressable
          onPress={() => {
            setMonth(parseDateKey(value) ?? new Date());
            setOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={copy("Choose date")}
          style={styles.icon}
        >
          <Ionicons name="calendar-outline" size={20} color={colors.brand} />
        </Pressable>
      </View>
      {value && !parseDateKey(value) ? (
        <Text style={styles.error}>{copy("Use YYYY-MM-DD format.")}</Text>
      ) : null}
      <Sheet visible={open} onClose={() => setOpen(false)} title={copy(label)}>
        <View style={styles.monthRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy("Previous month")}
            style={styles.icon}
            onPress={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <Text style={type.title}>
            {month.toLocaleDateString(locale === "ar" ? "ar-LB" : "en-GB", {
              month: "long",
              year: "numeric",
            })}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy("Next month")}
            style={styles.icon}
            onPress={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </Pressable>
        </View>
        <View style={[styles.days, width < 380 && styles.smallDays]}>
          {width >= 380
            ? Array.from({ length: (days[0].getDay() + 6) % 7 }, (_, i) => (
                <View key={"pad" + i} style={styles.day} />
              ))
            : null}
          {days.map((date) => {
            const selected = localDateKey(date) === value;
            return (
              <Pressable
                key={localDateKey(date)}
                style={[
                  styles.day,
                  width < 380 && styles.smallDay,
                  selected && styles.selected,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={date.toLocaleDateString(
                  locale === "ar" ? "ar-LB" : "en-GB",
                  { dateStyle: "full" },
                )}
                onPress={() => select(date)}
              >
                <Text style={selected ? styles.selectedText : type.body}>
                  {width < 380
                    ? date.toLocaleDateString(
                        locale === "ar" ? "ar-LB" : "en-GB",
                        { weekday: "short", day: "numeric" },
                      )
                    : date.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Sheet>
    </View>
  );
}
const styles = StyleSheet.create({
  field: { gap: 6, flexShrink: 1, minWidth: 140 },
  control: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  icon: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  days: { flexDirection: "row", flexWrap: "wrap" },
  day: {
    width: "14.285714%",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  smallDays: { gap: 4 },
  smallDay: { width: "100%", alignItems: "flex-start", paddingHorizontal: 16 },
  selected: { backgroundColor: colors.brand },
  selectedText: { color: colors.onBrand, fontWeight: "700" },
  error: { ...type.caption, color: colors.danger },
});
