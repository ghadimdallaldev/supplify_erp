import { Text } from "./primitives";
import { useAppLocale as useUiLocale } from "../../i18n";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { haptic } from "./motion";
import { copy } from "../../i18n";
import { colors, theme } from "../../theme";

export type FilterOption = { key: string; label: string; count?: number };

export function FilterBar({
  options,
  value,
  onChange,
}: {
  options: FilterOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  useUiLocale();

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {options.map((opt) => {
          const active = opt.key === value;
          return (
            <Pressable
              key={opt.key}
              onPress={() => {
                haptic();
                onChange(opt.key);
              }}
              style={({ pressed }) => [
                styles.chip,
                active && styles.chipActive,
                pressed && !active && styles.chipPressed,
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
                numberOfLines={1}
              >
                {copy(opt.label)}
                {opt.count != null && opt.count > 0 ? `  ${opt.count}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: theme.spacing.sm },
  row: {
    paddingHorizontal: theme.gutter,
    gap: theme.spacing.sm,
    flexDirection: "row",
  },
  chip: {
    minHeight: 48,
    justifyContent: "center",
    paddingHorizontal: theme.spacing.md,
    borderRadius: 8,
    borderWidth: theme.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipActive: {
    borderColor: colors.brandBorder,
    backgroundColor: colors.brandLight,
  },
  chipPressed: { backgroundColor: colors.surfaceMuted },
  chipText: { fontSize: 12.5, fontWeight: "600", color: colors.textMuted },
  chipTextActive: { color: colors.brandDark },
});
