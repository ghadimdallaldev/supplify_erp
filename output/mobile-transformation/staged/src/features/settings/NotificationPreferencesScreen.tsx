import { Text } from "../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../i18n";
import { useEffect, useState } from "react";
import { Alert, StyleSheet, Switch, View } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { resolveAppRoleNav } from "../../hooks/usePermissions";
import {
  retryPushRegistration,
  usePushRegistrationStatus,
} from "../push/usePushRegistration";
import { getPushRuntimeLabel } from "../../services/push";
import {
  useNotificationPreferences,
  useUpdateNotificationPreferences,
} from "../../services/api/queries";
import type { NotificationPreferences } from "../../types/notifications";
import {
  Button,
  Card,
  LoadingState,
  Screen,
  SectionHeader,
} from "../../components/ui";
import { colors, theme, type } from "../../theme";

type PreferenceItem = {
  key: keyof NotificationPreferences;
  label: string;
  subtitle: string;
};

const CHANNELS: PreferenceItem[] = [
  {
    key: "pushEnabled",
    label: "Push notifications",
    subtitle: "Alerts on this phone",
  },
  {
    key: "inAppEnabled",
    label: "In-app notifications",
    subtitle: "Updates in your Supplify inbox",
  },
  {
    key: "emailEnabled",
    label: "Email",
    subtitle: "Important updates by email",
  },
  {
    key: "whatsappEnabled",
    label: "WhatsApp",
    subtitle: "Enabled when configured for your account",
  },
];

const ORDER_EVENTS: PreferenceItem[] = [
  {
    key: "notifyOrderNew",
    label: "New orders",
    subtitle: "New incoming or placed orders",
  },
  {
    key: "notifyOrderAcknowledged",
    label: "Acknowledged",
    subtitle: "Supplier accepted an order",
  },
  {
    key: "notifyOrderProcessing",
    label: "Processing",
    subtitle: "Order preparation started",
  },
  {
    key: "notifyOrderShipped",
    label: "Shipped",
    subtitle: "Delivery is on the way",
  },
  {
    key: "notifyOrderDelivered",
    label: "Delivered",
    subtitle: "Delivery completed",
  },
  {
    key: "notifyOrderCancelled",
    label: "Cancelled",
    subtitle: "Order was cancelled",
  },
];

const OTHER_EVENTS: PreferenceItem[] = [
  {
    key: "notifyMessageReceived",
    label: "Messages",
    subtitle: "New chat messages",
  },
  {
    key: "notifyInvoiceIssued",
    label: "Invoices issued",
    subtitle: "A new invoice is ready",
  },
  {
    key: "notifyInvoiceOverdue",
    label: "Overdue invoices",
    subtitle: "Payment needs attention",
  },
  {
    key: "notifyPaymentReceived",
    label: "Payments",
    subtitle: "A payment was recorded",
  },
  {
    key: "notifyLowStock",
    label: "Low stock",
    subtitle: "Inventory is below threshold",
  },
  {
    key: "notifyOutOfStock",
    label: "Out of stock",
    subtitle: "Inventory reached zero",
  },
  {
    key: "notifyPromotions",
    label: "Deals",
    subtitle: "Relevant supplier promotions",
  },
  {
    key: "notifyBilling",
    label: "Account and billing",
    subtitle: "Subscription and account notices",
  },
];

/** Drivers get assignment, reschedule and failure alerts on their channels; only delivery confirmations have their own toggle server-side. */
const DRIVER_CHANNELS: PreferenceItem[] = [
  {
    key: "pushEnabled",
    label: "Push notifications",
    subtitle: "Alerts on this phone",
  },
  {
    key: "inAppEnabled",
    label: "In-app notifications",
    subtitle: "Updates in your Supplify inbox",
  },
];

const DRIVER_EVENTS: PreferenceItem[] = [
  {
    key: "notifyOrderDelivered",
    label: "Delivery confirmations",
    subtitle: "Your completed deliveries are recorded",
  },
];

export function NotificationPreferencesScreen() {
  useUiLocale();

  const { user } = useAuth();
  const isDriver = resolveAppRoleNav(user) === "driver";
  const query = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const pushStatus = usePushRegistrationStatus();
  const [draft, setDraft] = useState<NotificationPreferences | null>(null);
  const [retryingPush, setRetryingPush] = useState(false);

  useEffect(() => {
    if (query.data) setDraft(query.data);
  }, [query.data]);

  if (query.isLoading || !draft) return <LoadingState />;

  const setPreference = (
    key: keyof NotificationPreferences,
    value: boolean,
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  };

  const save = async () => {
    try {
      await update.mutateAsync(draft);
      Alert.alert(
        uiCopy("Preferences saved"),
        uiCopy("Your notification choices are up to date."),
      );
    } catch (error) {
      Alert.alert(
        uiCopy("Could not save"),
        error instanceof Error ? error.message : uiCopy("Try again."),
      );
    }
  };

  const retryDevicePush = async () => {
    setRetryingPush(true);
    try {
      await retryPushRegistration();
      Alert.alert(
        uiCopy("Push is ready"),
        uiCopy("This device can receive Supplify notifications."),
      );
    } catch (error) {
      Alert.alert(
        uiCopy("Push setup needs attention"),
        error instanceof Error
          ? error.message
          : uiCopy("Could not register this device."),
      );
    } finally {
      setRetryingPush(false);
    }
  };

  const relevantOther = OTHER_EVENTS.filter((item) => {
    if (item.key === "notifyLowStock" || item.key === "notifyOutOfStock") {
      return user?.role === "RESTAURANT";
    }
    if (item.key === "notifyPaymentReceived") return user?.role === "SUPPLIER";
    if (item.key === "notifyPromotions") return user?.role === "RESTAURANT";
    return true;
  });

  const pushReady = pushStatus.state === "ready";
  const pushChecking = pushStatus.state === "checking";

  return (
    <Screen title={uiCopy("Notification settings")} scroll>
      <SectionHeader>{uiCopy("Delivery channels")}</SectionHeader>
      <Card elevated={false} style={styles.group}>
        {(isDriver ? DRIVER_CHANNELS : CHANNELS).map((item) => (
          <PreferenceRow
            key={String(item.key)}
            item={item}
            value={draft[item.key]}
            onChange={(value) => setPreference(item.key, value)}
          />
        ))}
      </Card>

      <Card elevated={false} style={styles.pushStatusCard}>
        <View style={styles.pushStatusHeader}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: pushReady ? colors.success : colors.warning },
            ]}
          />
          <Text style={type.title}>
            {pushReady
              ? uiCopy("Device push ready")
              : uiCopy("Device push status")}
          </Text>
        </View>
        <Text style={styles.pushStatusMessage}>{pushStatus.message}</Text>
        <Text style={styles.pushRuntimeLabel}>
          {uiCopy("Runtime:")} {getPushRuntimeLabel()}
        </Text>
        <Button
          label={
            pushReady
              ? uiCopy("Recheck device push")
              : uiCopy("Retry device push setup")
          }
          variant="outline"
          onPress={() => void retryDevicePush()}
          loading={retryingPush || pushChecking}
          disabled={retryingPush || pushChecking}
        />
      </Card>

      <SectionHeader>
        {isDriver ? uiCopy("Delivery alerts") : uiCopy("Order activity")}
      </SectionHeader>
      <Card elevated={false} style={styles.group}>
        {(isDriver ? DRIVER_EVENTS : ORDER_EVENTS).map((item) => (
          <PreferenceRow
            key={String(item.key)}
            item={item}
            value={draft[item.key]}
            onChange={(value) => setPreference(item.key, value)}
          />
        ))}
      </Card>
      {isDriver ? null : (
        <>
          <SectionHeader>{uiCopy("Other updates")}</SectionHeader>
          <Card elevated={false} style={styles.group}>
            {relevantOther.map((item) => (
              <PreferenceRow
                key={String(item.key)}
                item={item}
                value={draft[item.key]}
                onChange={(value) => setPreference(item.key, value)}
              />
            ))}
          </Card>
        </>
      )}
      <Button
        label={uiCopy("Save preferences")}
        icon="checkmark-outline"
        onPress={() => void save()}
        loading={update.isPending}
        disabled={update.isPending}
      />
    </Screen>
  );
}

function PreferenceRow({
  item,
  value,
  onChange,
}: {
  item: PreferenceItem;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  useUiLocale();

  return (
    <View style={styles.row}>
      <View style={styles.flex}>
        <Text style={type.title}>{item.label}</Text>
        <Text style={styles.subtitle}>{item.subtitle}</Text>
      </View>
      <Switch
        value={Boolean(value)}
        onValueChange={onChange}
        trackColor={{ false: colors.borderStrong, true: colors.brandLight }}
        thumbColor={value ? colors.brand : colors.surface}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  group: { paddingVertical: 0 },
  row: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  subtitle: { ...type.label, marginTop: 3, paddingRight: theme.spacing.sm },
  pushStatusCard: { gap: theme.spacing.sm, marginBottom: theme.spacing.md },
  pushStatusHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing.sm,
  },
  pushStatusMessage: { ...type.label, fontWeight: "500" },
  pushRuntimeLabel: { ...type.caption },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
});
