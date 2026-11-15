import { Text } from "../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../i18n";
import { copy } from "../i18n";
import { StyleSheet, View } from "react-native";
import { Button, Screen, SectionHeader } from "../components/ui";
import { OpenOnWebRow } from "../features/shared/OpenOnWebRow";
import { useAuth } from "../features/auth/AuthContext";
import { colors, theme } from "../theme";

const monitorLinks = [
  ["Overview", "/app/admin"],
  ["Activity", "/app/admin/activity"],
  ["Health", "/app/admin/health"],
  ["Operations", "/app/admin/operations"],
  ["Audit log", "/app/admin/audit"],
] as const;

const accountLinks = [
  ["Tenants", "/app/admin/tenants"],
  ["Users", "/app/admin/users"],
] as const;

const billingLinks = [
  ["Plans", "/app/admin/plans"],
  ["Subscriptions", "/app/admin/subscriptions"],
  ["Finance", "/app/admin/finance"],
  ["Usage", "/app/admin/usage"],
  ["Limits", "/app/admin/limits"],
] as const;

const growthLinks = [
  ["Feature flags", "/app/admin/features"],
  ["Deals & boosts", "/app/admin/deals"],
] as const;

export function AdminHomeScreen() {
  useUiLocale();

  const { logout } = useAuth();

  return (
    <Screen title={uiCopy("Platform admin")} scroll>
      <View style={styles.intro}>
        <Text style={styles.title}>{uiCopy("Admin console")}</Text>
        <Text style={styles.message}>
          {uiCopy(
            "Manage the ERP platform, tenants, billing, operations, and system health. Secure admin pages open in your browser.",
          )}
        </Text>
      </View>

      <SectionHeader>{uiCopy("Monitor")}</SectionHeader>
      {monitorLinks.map(([title, path]) => (
        <OpenOnWebRow key={path} title={copy(title)} path={path} />
      ))}

      <SectionHeader>{uiCopy("Accounts")}</SectionHeader>
      {accountLinks.map(([title, path]) => (
        <OpenOnWebRow key={path} title={copy(title)} path={path} />
      ))}

      <SectionHeader>{uiCopy("Billing")}</SectionHeader>
      {billingLinks.map(([title, path]) => (
        <OpenOnWebRow key={path} title={copy(title)} path={path} />
      ))}

      <SectionHeader>{uiCopy("Growth")}</SectionHeader>
      {growthLinks.map(([title, path]) => (
        <OpenOnWebRow key={path} title={copy(title)} path={path} />
      ))}

      <SectionHeader>{uiCopy("Tenant portals")}</SectionHeader>
      <OpenOnWebRow
        title={uiCopy("Supplier tenants")}
        path="/app/admin/suppliers"
      />
      <OpenOnWebRow
        title={uiCopy("Restaurant tenants")}
        path="/app/admin/restaurants"
      />

      <Button
        label={uiCopy("Sign out")}
        variant="danger"
        icon="log-out-outline"
        onPress={() => void logout()}
        style={styles.signOut}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  message: {
    color: colors.textMuted,
    lineHeight: 20,
    marginTop: theme.spacing.xs,
  },
  signOut: { marginTop: theme.spacing.lg },
});
