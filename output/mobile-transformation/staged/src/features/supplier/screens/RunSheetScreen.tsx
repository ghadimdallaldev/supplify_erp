import { DateField } from "../../../components/ui/DateField";
import { Text, TextInput } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRunSheet } from "../../../services/api/queries";
import {
  Card,
  LoadingState,
  SectionHeader,
  StatCard,
} from "../../../components/ui";
import { formatMoney, formatShortDate } from "../../../utils/format";
import { colors, theme, type } from "../../../theme";

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function RunSheetScreen() {
  useUiLocale();

  const [date, setDate] = useState(todayIsoDate);
  const queryDate = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
  const { data, isLoading, isError } = useRunSheet(queryDate);

  if (isLoading) return <LoadingState message={uiCopy("Loading run sheet…")} />;

  const kpis = data?.summary?.kpis;
  const ordersToPick = data?.ordersToPick?.orders ?? [];
  const receivables = data?.receivablesDueToday?.invoices ?? [];
  const receivablesSummary = data?.receivablesDueToday?.summary;
  const shortages = data?.shortages?.preview ?? [];

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.dateRow}>
        <Ionicons name="calendar-outline" size={18} color={colors.brand} />
        <DateField value={date} onChange={setDate} />
      </View>

      {isError || !data ? (
        <Card>
          <Text style={styles.errorText}>
            {uiCopy("Could not load run sheet for this date.")}
          </Text>
        </Card>
      ) : (
        <>
          <View style={styles.statsRow}>
            <StatCard
              value={kpis?.ordersToPrepareToday ?? 0}
              label={uiCopy("To prepare")}
              icon="cube-outline"
              tone="info"
            />
            <StatCard
              value={kpis?.deliveriesPendingToday ?? 0}
              label={uiCopy("Deliveries")}
              icon="car-outline"
              tone="warning"
            />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              value={kpis?.ordersWaitingAction ?? 0}
              label={uiCopy("Need action")}
              icon="alert-circle-outline"
              tone="danger"
            />
            <StatCard
              value={kpis?.openDisputes ?? 0}
              label={uiCopy("Disputes")}
              icon="scale-outline"
              tone="neutral"
            />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              value={formatMoney(kpis?.unpaidBalance ?? 0)}
              label={uiCopy("Unpaid")}
              icon="cash-outline"
              tone="warning"
            />
            <StatCard
              value={kpis?.lowStockCount ?? 0}
              label={uiCopy("Low stock")}
              icon="trending-down-outline"
              tone="danger"
            />
          </View>

          <SectionHeader>
            {uiCopy("Orders to pick (")}
            {data.ordersToPick?.count ?? ordersToPick.length})
          </SectionHeader>
          {ordersToPick.length === 0 ? (
            <Text style={styles.empty}>
              {uiCopy("No orders to pick today.")}
            </Text>
          ) : (
            ordersToPick.map((order) => (
              <Card key={order.orderId}>
                <Text style={styles.rowTitle}>{order.restaurantName}</Text>
                <Text style={styles.meta}>
                  {order.orderStatus}
                  {order.pickListStatus
                    ? uiCopy(" · Pick list {{v0}}", {
                        v0: order.pickListStatus,
                      })
                    : ""}
                </Text>
                {formatShortDate(order.scheduledAt) ? (
                  <Text style={styles.meta}>
                    {uiCopy("Scheduled")} {formatShortDate(order.scheduledAt)}
                  </Text>
                ) : null}
              </Card>
            ))
          )}

          <SectionHeader>
            {uiCopy("Receivables due today (")}
            {receivablesSummary?.count ?? receivables.length})
          </SectionHeader>
          {receivables.length === 0 ? (
            <Text style={styles.empty}>
              {uiCopy("No receivables due today.")}
            </Text>
          ) : (
            <>
              {receivablesSummary ? (
                <Text style={styles.summary}>
                  {uiCopy("Total")}{" "}
                  {formatMoney(receivablesSummary.totalBalanceDue ?? 0)}
                  {receivablesSummary.overdueCount
                    ? uiCopy(" · {{v0}} overdue", {
                        v0: receivablesSummary.overdueCount,
                      })
                    : ""}
                </Text>
              ) : null}
              {receivables.map((inv) => (
                <Card key={inv.id}>
                  <View style={styles.rowHead}>
                    <Text style={styles.rowTitle}>
                      {inv.restaurantName ?? uiCopy("Invoice")}
                    </Text>
                    {inv.isOverdue ? (
                      <View style={styles.overdueBadge}>
                        <Text style={styles.overdueText}>
                          {uiCopy("Overdue")}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.meta}>
                    {inv.invoiceNumber ? `#${inv.invoiceNumber} · ` : ""}{" "}
                    {uiCopy("Due")} {inv.dueDate} ·{" "}
                    {formatMoney(inv.balanceDue)}
                  </Text>
                </Card>
              ))}
            </>
          )}

          <SectionHeader>
            {uiCopy("Shortages (")}
            {data.shortages?.count ?? shortages.length})
          </SectionHeader>
          {shortages.length === 0 ? (
            <Text style={styles.empty}>{uiCopy("No shortages flagged.")}</Text>
          ) : (
            shortages.map((item) => (
              <Card key={item.id}>
                <Text style={styles.rowTitle}>{item.productName}</Text>
                <Text style={styles.meta}>
                  {item.restaurantName} {uiCopy("· Order")}{" "}
                  {item.orderId.slice(0, 8)}
                </Text>
              </Card>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  dateInput: {
    flex: 1,
    minHeight: theme.touchMin,
    fontSize: 16,
    fontWeight: "600",
    color: colors.text,
  },
  statsRow: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  errorText: { color: colors.danger, fontWeight: "600" },
  empty: { ...type.label, marginBottom: theme.spacing.md },
  summary: { ...type.label, marginBottom: theme.spacing.sm },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  rowTitle: { ...type.title },
  meta: { ...type.label, marginTop: 4 },
  overdueBadge: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
    borderWidth: 1,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  overdueText: { fontSize: 11, fontWeight: "700", color: colors.danger },
});
