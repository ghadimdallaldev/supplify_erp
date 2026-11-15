import { copy as uiCopy, useAppLocale as useUiLocale } from "../i18n";
import { Image, ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../features/auth/AuthContext";
import type { AuthStackParamList } from "../navigation/AuthNavigator";
import { Button } from "../components/ui";
import { Text } from "../components/ui/primitives";
import { LegalLinks } from "../components/LegalLinks";
import { useMobilePublicShopEnabled } from "../features/publicShop/useMobilePublicShopEnabled";
import { colors, theme, type } from "../theme";
import { useAdaptiveLayout } from "../theme/responsive";
import { t } from "../i18n";

export function SignInExperience() {
  useUiLocale();

  const { login, register, isLoading } = useAuth();
  const insets = useSafeAreaInsets();
  const { wide } = useAdaptiveLayout();
  const navigation =
    useNavigation<NativeStackNavigationProp<AuthStackParamList>>();
  const { enabled: publicShopEnabled, isLoading: flagLoading } =
    useMobilePublicShopEnabled();
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.page,
        { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 20 },
        wide && styles.wide,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={[styles.identity, wide && styles.identityWide]}>
        <View style={styles.wordmark}>
          <Image
            source={require("../../assets/icon.png")}
            style={styles.mark}
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.brand}>{uiCopy("Supplify")}</Text>
        </View>
        <View style={styles.hero}>
          <View style={styles.rule} />
          <Text style={styles.headline} accessibilityRole="header">
            {t("tagline")}
          </Text>
          <Text style={styles.description}>
            {uiCopy(
              "The everyday workspace for restaurants, suppliers, and the people who keep them moving.",
            )}
          </Text>
        </View>
        <View style={styles.capabilities}>
          {(
            [
              ["receipt-outline", "featureOrders"],
              ["navigate-outline", "featureTracking"],
              ["layers-outline", "featureFulfillment"],
            ] as const
          ).map(([icon, key]) => (
            <View key={key} style={styles.capability}>
              <Ionicons name={icon} size={20} color={colors.brand} />
              <Text style={type.body}>{t(key)}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={[styles.entry, wide && styles.entryWide]}>
        <Text style={type.h2}>{t("welcomeBack")}</Text>
        <Text style={[type.body, styles.subtitle]}>{t("signInSubtitle")}</Text>
        <Button
          label={isLoading ? t("signingIn") : t("signIn")}
          icon="arrow-forward"
          loading={isLoading}
          onPress={() => void login()}
        />
        {!flagLoading && publicShopEnabled ? (
          <View style={styles.secondary}>
            <Button
              label={uiCopy("Browse as guest")}
              variant="outline"
              disabled={isLoading}
              onPress={() => navigation.navigate("GuestShop")}
            />
            <Button
              label={uiCopy("Create shopper account")}
              variant="ghost"
              disabled={isLoading}
              onPress={() => void register()}
            />
          </View>
        ) : null}
        <View style={styles.security}>
          <Ionicons
            name="lock-closed-outline"
            size={14}
            color={colors.textMuted}
          />
          <Text style={type.caption}>{t("securedBySso")}</Text>
        </View>
        <LegalLinks compact />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  page: {
    flexGrow: 1,
    paddingHorizontal: 28,
    justifyContent: "space-between",
    gap: 40,
    maxWidth: 1200,
    width: "100%",
    alignSelf: "center",
  },
  wide: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 56,
    gap: 72,
  },
  identity: { gap: 32 },
  identityWide: { flex: 1 },
  wordmark: { flexDirection: "row", alignItems: "center", gap: 10 },
  mark: { width: 36, height: 36, borderRadius: 9 },
  brand: {
    fontSize: 22,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  hero: { gap: 18 },
  rule: {
    width: 36,
    height: 3,
    backgroundColor: colors.brand,
    borderRadius: 2,
  },
  headline: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: "700",
    letterSpacing: -1.3,
    maxWidth: 420,
  },
  description: { ...type.body, color: colors.textMuted, maxWidth: 400 },
  capabilities: { gap: 14 },
  capability: { flexDirection: "row", alignItems: "center", gap: 12 },
  entry: {
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: colors.separator,
    gap: 12,
  },
  entryWide: {
    width: 360,
    borderTopWidth: 0,
    padding: 28,
    backgroundColor: colors.background,
    borderRadius: theme.radius.lg,
  },
  subtitle: { color: colors.textMuted, marginBottom: 12 },
  secondary: { gap: 8 },
  security: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
    marginVertical: 6,
  },
});
