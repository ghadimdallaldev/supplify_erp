import { Text } from "../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../i18n";
import { useCallback, useEffect, useState } from "react";
import { Alert, Linking, StyleSheet, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { ApiError, api } from "../../services/api/client";
import { Button, Card, LoadingState, Screen } from "../../components/ui";
import { LegalLinks } from "../../components/LegalLinks";
import { webAppUrl } from "../../utils/webAppUrl";
import { colors, theme } from "../../theme";

type RetentionSummary = {
  deleted: string[];
  anonymized: string[];
  retained: string[];
};

type OwnershipBlocker = {
  code: string;
  workspaceType: "SUPPLIER" | "RESTAURANT";
  organizationId: string;
  organizationName: string;
  message: string;
};

type DeletionStatus = {
  canDelete: boolean;
  alreadyDeleted?: boolean;
  blockers: OwnershipBlocker[];
  retention: RetentionSummary;
};

export function DeleteAccountScreen() {
  useUiLocale();

  const { logout } = useAuth();
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<DeletionStatus>(
        "/api/account/deletion-status",
      );
      setStatus(data);
    } catch (error) {
      Alert.alert(
        uiCopy("Could not load"),
        error instanceof Error ? error.message : uiCopy("Try again"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = () => {
    Alert.alert(
      uiCopy("Delete account permanently?"),
      uiCopy(
        "This cannot be undone. Orders and invoices are retained for legal and financial reasons.",
      ),
      [
        { text: uiCopy("Cancel"), style: "cancel" },
        {
          text: uiCopy("Delete"),
          style: "destructive",
          onPress: () => void runDelete(),
        },
      ],
    );
  };

  const runDelete = async () => {
    setSubmitting(true);
    try {
      await api.delete("/api/account", { confirmation: "DELETE" });
      await logout();
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "ORG_OWNER_MUST_TRANSFER_OR_CLOSE"
      ) {
        Alert.alert(
          uiCopy("Organization owner"),
          uiCopy(
            "Transfer ownership or close the organization on the web before deleting your personal account. Your business is never deleted automatically.",
          ),
          [
            { text: uiCopy("Cancel"), style: "cancel" },
            {
              text: uiCopy("Open web"),
              onPress: () => void Linking.openURL(webAppUrl("/account/delete")),
            },
          ],
        );
        await load();
        return;
      }
      Alert.alert(
        uiCopy("Deletion failed"),
        error instanceof Error ? error.message : uiCopy("Try again"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !status) {
    return (
      <Screen title={uiCopy("Delete account")}>
        <LoadingState message={uiCopy("Loading deletion status…")} />
      </Screen>
    );
  }

  return (
    <Screen title={uiCopy("Delete account")} scroll>
      <View style={styles.body}>
        <Text style={styles.lead}>
          {uiCopy(
            "Permanently delete your personal Supplify account. Organization ownership is never removed as a side effect of this action.",
          )}
        </Text>

        <Card>
          <Text style={styles.section}>{uiCopy("Deleted")}</Text>
          {status.retention.deleted.map((item) => (
            <Text key={item} style={styles.item}>
              • {item}
            </Text>
          ))}
          <Text style={styles.section}>{uiCopy("Anonymized")}</Text>
          {status.retention.anonymized.map((item) => (
            <Text key={item} style={styles.item}>
              • {item}
            </Text>
          ))}
          <Text style={styles.section}>{uiCopy("Retained")}</Text>
          {status.retention.retained.map((item) => (
            <Text key={item} style={styles.item}>
              • {item}
            </Text>
          ))}
        </Card>

        {status.blockers.length > 0 ? (
          <Card>
            <Text style={styles.warnTitle}>
              {uiCopy("Owner action required")}
            </Text>
            <Text style={styles.item}>
              {uiCopy(
                "You own one or more organizations. Transfer ownership or close the organization on the web first. Personal deletion will not close the business.",
              )}
            </Text>
            {status.blockers.map((b) => (
              <Text key={b.organizationId} style={styles.item}>
                • {b.organizationName} ({b.workspaceType})
              </Text>
            ))}
            <Button
              label={uiCopy("Manage on web")}
              variant="outline"
              onPress={() => void Linking.openURL(webAppUrl("/account/delete"))}
            />
          </Card>
        ) : (
          <Button
            label={uiCopy("Delete my account")}
            variant="danger"
            loading={submitting}
            onPress={confirmDelete}
          />
        )}

        <LegalLinks />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: theme.gutter, gap: theme.spacing.md },
  lead: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  section: {
    marginTop: theme.spacing.sm,
    fontWeight: "700",
    color: colors.text,
  },
  item: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  warnTitle: {
    fontWeight: "700",
    color: colors.danger || "#b45309",
    marginBottom: 6,
  },
});
