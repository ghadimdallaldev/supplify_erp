import { useAppLocale as useUiLocale } from "../../i18n";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, theme, type } from "../../theme";
import { Text } from "./primitives";
import { isRtl } from "../../i18n";

export function NextAction({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  useUiLocale();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.root, pressed && styles.pressed]}
    >
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.arrow}>
        <Ionicons
          name={isRtl() ? "arrow-back" : "arrow-forward"}
          size={20}
          color={colors.onBrand}
        />
      </View>
    </Pressable>
  );
}
const styles = StyleSheet.create({
  root: {
    marginHorizontal: theme.gutter,
    marginTop: 4,
    marginBottom: 12,
    padding: 20,
    backgroundColor: colors.brandDeep,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 96,
  },
  body: { flex: 1, minWidth: 0 },
  title: { ...type.title, color: colors.onBrand },
  subtitle: { ...type.body, color: colors.onBrandMuted, marginTop: 4 },
  arrow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: 0.9 },
});
