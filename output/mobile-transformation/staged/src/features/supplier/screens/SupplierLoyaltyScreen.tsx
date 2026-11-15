import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { RefreshControl, StyleSheet, View } from "react-native";
import {
  useSupplierLoyaltyBalances,
  useSupplierLoyaltyProgram,
} from "../../../services/api/queries/loyalty";
import { usePermissions } from "../../../hooks/usePermissions";
import type { SupplierLoyaltyBalance } from "../../../types/loyalty";
import {
  Card,
  EmptyState,
  FlashList,
  Group,
  LoadingState,
  Metric,
  OperationalRow,
  Screen,
  SectionHeader,
} from "../../../components/ui";
import { OpenOnWebRow } from "../../shared/OpenOnWebRow";
import { colors, theme, type } from "../../../theme";

function formatPoints(value: number | undefined | null): string {
  const n = Number(value ?? 0);
  if (Number.isNaN(n)) return "0";
  return n.toLocaleString();
}

export function SupplierLoyaltyScreen() {
  useUiLocale();

  const { can } = usePermissions();
  const canViewBalances = can("ORDERS_VIEW");
  const programQuery = useSupplierLoyaltyProgram();
  const balancesQuery = useSupplierLoyaltyBalances(canViewBalances);

  if (programQuery.isLoading) return <LoadingState />;

  const program = programQuery.data?.program;
  const balances = balancesQuery.data?.balances ?? [];
  const enabled = program?.enabled ?? false;

  return (
    <Screen
      title={uiCopy("Loyalty program")}
      subtitle={program?.name ?? uiCopy("Partner rewards")}
      scroll={false}
      padded={false}
    >
      <FlashList
        data={canViewBalances ? balances : []}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={programQuery.isRefetching || balancesQuery.isRefetching}
            onRefresh={() => {
              void programQuery.refetch();
              if (canViewBalances) void balancesQuery.refetch();
            }}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.statsRow}>
              <Metric
                value={enabled ? "Active" : "Off"}
                label={uiCopy("Program status")}
              />
              <Metric
                value={formatPoints(program?.earn_points_per_currency ?? 0)}
                label={uiCopy("Points per $1")}
              />
            </View>
            <Card style={styles.summaryCard}>
              <Text style={type.title}>{uiCopy("Program rules")}</Text>
              <Text style={styles.ruleLine}>
                {uiCopy("Redeem:")} {program?.redeem_currency_per_point ?? 0}{" "}
                {uiCopy("per point")}
              </Text>
              <Text style={styles.ruleLine}>
                {uiCopy("Min redeem:")}{" "}
                {formatPoints(program?.min_redeem_points)} {uiCopy("points")}
              </Text>
              <Text style={styles.ruleLine}>
                {uiCopy("Max redeem:")} {program?.max_redeem_percent ?? 0}{" "}
                {uiCopy("% of order")}
              </Text>
              {!program ? (
                <Text style={styles.hint}>
                  {uiCopy("No program configured yet — set it up on web.")}
                </Text>
              ) : null}
            </Card>
            {canViewBalances ? (
              <SectionHeader style={styles.section}>
                {uiCopy("Restaurant balances")}
              </SectionHeader>
            ) : (
              <Card style={styles.summaryCard}>
                <Text style={styles.hint}>
                  {uiCopy(
                    "Order view permission is required to see restaurant point balances.",
                  )}
                </Text>
              </Card>
            )}
          </View>
        }
        ListEmptyComponent={
          canViewBalances ? (
            balancesQuery.isLoading ? (
              <LoadingState message={uiCopy("Loading balances…")} />
            ) : (
              <EmptyState
                icon="people-outline"
                title={uiCopy("No balances yet")}
                message={uiCopy(
                  "Restaurants earn points when the program is active and they place orders.",
                )}
              />
            )
          ) : null
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <SectionHeader style={styles.section}>
              {uiCopy("Manage on web")}
            </SectionHeader>
            <Group>
              <OpenOnWebRow
                title={uiCopy("Edit program settings")}
                path="/app/loyalty"
              />
            </Group>
          </View>
        }
        renderItem={({ item }) => <BalanceRow balance={item} />}
      />
    </Screen>
  );
}

function BalanceRow({ balance }: { balance: SupplierLoyaltyBalance }) {
  useUiLocale();

  return (
    <OperationalRow
      avatarLabel={balance.restaurant_name}
      title={balance.restaurant_name}
      subtitle={uiCopy("Earned {{v0}} · Redeemed {{v1}}", {
        v0: formatPoints(balance.lifetime_earned),
        v1: formatPoints(balance.lifetime_redeemed),
      })}
      meta={uiCopy("{{v0}} pts", { v0: formatPoints(balance.points_balance) })}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: theme.spacing.xxl },
  header: {
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  statsRow: { flexDirection: "row", gap: theme.spacing.lg, flexWrap: "wrap" },
  summaryCard: { gap: 6 },
  ruleLine: { color: colors.textMuted, fontWeight: "500" },
  hint: { color: colors.textFaint, fontStyle: "italic", marginTop: 4 },
  section: { marginTop: theme.spacing.sm, marginBottom: 0 },
  footer: { marginTop: theme.spacing.md },
});
