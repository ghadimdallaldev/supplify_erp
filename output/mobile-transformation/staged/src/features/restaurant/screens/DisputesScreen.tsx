import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useDisputes } from "../../../services/api/queries";
import {
  disputeCreatedAt,
  disputeOrderId,
  disputePartyName,
  disputeType,
  type Dispute,
} from "../../../types/disputes";
import type { RestaurantStackParamList } from "../../../navigation/RestaurantNavigator";
import {
  Card,
  EmptyState,
  FlashList,
  LoadingState,
  Screen,
  StatusPill,
} from "../../../components/ui";
import { formatDay } from "../../../utils/format";
import { colors, theme, type } from "../../../theme";

function prettyDisputeType(t: string): string {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function DisputesScreen() {
  useUiLocale();

  const navigation =
    useNavigation<NativeStackNavigationProp<RestaurantStackParamList>>();
  const { data: disputes, isLoading } = useDisputes();

  if (isLoading) return <LoadingState />;

  const rows = disputes ?? [];

  return (
    <Screen
      title={uiCopy("Disputes")}
      subtitle={uiCopy("{{v0}} dispute{{v1}}", {
        v0: rows.length,
        v1: rows.length === 1 ? "" : "s",
      })}
      scroll={false}
      padded={false}
    >
      <FlashList
        data={rows}
        contentContainerStyle={styles.list}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <EmptyState
            title={uiCopy("No disputes")}
            message={uiCopy(
              "Open a dispute from a delivered order if something went wrong.",
            )}
            icon="shield-outline"
          />
        }
        renderItem={({ item }) => (
          <DisputeRow
            dispute={item}
            onPress={() =>
              navigation.navigate("DisputeDetail", { disputeId: item.id })
            }
          />
        )}
      />
    </Screen>
  );
}

function DisputeRow({
  dispute,
  onPress,
}: {
  dispute: Dispute;
  onPress: () => void;
}) {
  useUiLocale();

  const typeLabel = disputeType(dispute);
  const orderId = disputeOrderId(dispute);
  const supplierName = disputePartyName(dispute, "RESTAURANT");
  const createdAt = disputeCreatedAt(dispute);

  return (
    <Pressable onPress={onPress}>
      <Card style={styles.card}>
        <View style={styles.rowTop}>
          <Text style={type.title}>{prettyDisputeType(typeLabel)}</Text>
          <StatusPill status={dispute.status} domain="dispute" />
        </View>
        {supplierName ? (
          <Text style={styles.meta} numberOfLines={1}>
            {supplierName}
          </Text>
        ) : null}
        {orderId ? (
          <Text style={styles.meta}>
            {uiCopy("Order")} {orderId.slice(0, 8)}
          </Text>
        ) : null}
        {dispute.description ? (
          <Text style={styles.desc} numberOfLines={2}>
            {dispute.description}
          </Text>
        ) : null}
        {createdAt ? (
          <Text style={styles.date}>{formatDay(createdAt)}</Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: theme.spacing.md, paddingBottom: theme.spacing.xxl },
  card: { marginBottom: theme.spacing.sm },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
  },
  meta: { ...type.label, marginTop: 4 },
  desc: { ...type.body, color: colors.textMuted, marginTop: 6 },
  date: { ...type.caption, marginTop: 8 },
});
