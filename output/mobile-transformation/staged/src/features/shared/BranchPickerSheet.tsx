import { Text } from "../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../i18n";
import { Sheet as DesignSheet } from "../../components/ui/Sheet";
import { useState } from "react";
import {
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useBranches, useSwitchBranch } from "../../services/api/queries";
import { saveActiveTenantToken } from "../auth/tokenStorage";
import { useAuth } from "../auth/AuthContext";
import { resetBusinessSession } from "../auth/sessionIsolation";
import { Button, ListRow } from "../../components/ui";
import { colors, theme } from "../../theme";

export function BranchPickerSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  useUiLocale();

  const { data, isLoading, isRefetching, refetch } = useBranches(visible);
  const switchBranch = useSwitchBranch();
  const { refreshUser } = useAuth();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const accounts = data?.accounts ?? [];
  const saving = switchBranch.isPending;

  const select = async (tenantId: string) => {
    if (saving || tenantId === data?.activeAccountId) return;
    setSelectedId(tenantId);
    try {
      const result = await switchBranch.mutateAsync({
        tenantId,
        tenantType: data?.tenantType ?? "RESTAURANT",
      });
      if (!result.activeTenantToken) {
        throw new Error(
          "The server did not return a mobile workspace token. Please update the ERP API.",
        );
      }
      resetBusinessSession(qc);
      await saveActiveTenantToken(result.activeTenantToken);
      await refreshUser();
      onClose();
    } catch (error) {
      Alert.alert(
        uiCopy("Could not switch workspace"),
        error instanceof Error ? error.message : uiCopy("Please try again."),
      );
    } finally {
      setSelectedId(null);
    }
  };

  return (
    <DesignSheet visible={visible} onClose={saving ? () => {} : onClose}>
      <Text style={styles.title}>
        {data?.tenantType === "SUPPLIER"
          ? uiCopy("Switch account")
          : uiCopy("Switch workspace")}
      </Text>
      <Text style={styles.meta}>
        {data?.tenantType === "SUPPLIER"
          ? uiCopy("Choose which supplier account or branch to work in.")
          : uiCopy("Choose the account you want to work in.")}
      </Text>
      <ScrollView
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
          />
        }
      >
        {isLoading ? (
          <Text style={styles.meta}>{uiCopy("Loading workspaces…")}</Text>
        ) : accounts.length === 0 ? (
          <Text style={styles.meta}>
            {uiCopy("No other workspaces are available.")}
          </Text>
        ) : (
          accounts.map((account) => {
            const active = account.id === data?.activeAccountId;
            const pending = saving && selectedId === account.id;
            return (
              <ListRow
                key={account.id}
                icon={account.isPrimary ? "business" : "storefront"}
                title={account.name}
                subtitle={
                  account.isPrimary
                    ? uiCopy("Primary account")
                    : account.accountName || uiCopy("Branch account")
                }
                right={
                  <Text style={[styles.status, active && styles.active]}>
                    {pending
                      ? uiCopy("Switching…")
                      : active
                        ? uiCopy("Active ✓")
                        : uiCopy("Switch")}
                  </Text>
                }
                onPress={
                  active || saving ? undefined : () => void select(account.id)
                }
                style={
                  active
                    ? styles.activeRow
                    : saving
                      ? styles.disabled
                      : undefined
                }
              />
            );
          })
        )}
      </ScrollView>
      <Button
        label={uiCopy("Close")}
        variant="outline"
        disabled={saving}
        onPress={onClose}
        style={{ marginTop: theme.spacing.md }}
      />
    </DesignSheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.4)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    padding: theme.spacing.lg,
    maxHeight: "76%",
  },
  title: { fontSize: 20, fontWeight: "800", color: colors.text },
  meta: {
    color: colors.textMuted,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.md,
  },
  list: { gap: theme.spacing.sm, paddingBottom: theme.spacing.xs },
  status: { color: colors.brand, fontWeight: "700" },
  active: { color: colors.success },
  activeRow: { borderColor: colors.success, borderWidth: 1 },
  disabled: { opacity: 0.6 },
});
