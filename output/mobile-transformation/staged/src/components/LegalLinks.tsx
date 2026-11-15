import { Text } from "./ui/primitives";
import { copy, useAppLocale as useUiLocale } from "../i18n";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { webAppUrl } from "../utils/webAppUrl";
import { colors, theme } from "../theme";

const LINKS = [
  { label: "Privacy Policy", path: "/legal/privacy_policy" },
  { label: "Terms", path: "/legal/terms_and_conditions" },
  { label: "Mobile App Terms", path: "/legal/mobile_app_terms" },
  { label: "Delete account (web)", path: "/account/delete" },
] as const;

export function LegalLinks({ compact = false }: { compact?: boolean }) {
  useUiLocale();

  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      {LINKS.map((link) => (
        <Pressable
          key={link.path}
          accessibilityRole="link"
          onPress={() => void Linking.openURL(webAppUrl(link.path))}
          style={styles.row}
        >
          <Text style={styles.link}>{copy(link.label)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: 16,
    paddingVertical: theme.spacing.sm,
  },
  compact: { paddingVertical: 0 },
  row: { minHeight: 48, justifyContent: "center" },
  link: { color: colors.textMuted, fontSize: 12, fontWeight: "500" },
});
