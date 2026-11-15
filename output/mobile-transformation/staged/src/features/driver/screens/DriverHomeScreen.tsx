import { Text } from "../../../components/ui/primitives";
import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../i18n";
import { useCallback, useMemo } from "react";
import { Alert, Linking, RefreshControl, StyleSheet, View } from "react-native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { DriverStackParamList } from "../../../navigation/DriverNavigator";
import { useAuth } from "../../../features/auth/AuthContext";
import {
  useDriverActiveRoute,
  useDriverBoard,
  useOptimizeRoute,
} from "../../../services/api/queries";
import { useDriverGpsTracking } from "../../../hooks/useDriverGpsTracking";
import {
  Button,
  EmptyState,
  ErrorState,
  FlashList,
  ListSkeleton,
  Metric,
  OperationalRow,
  Screen,
  SectionHeader,
  StatusPill,
  TextButton,
} from "../../../components/ui";
import { HomeChrome, MetricStrip } from "../../../components/layout/HomeChrome";
import {
  formatDeliveryStatusLabel,
  getDriverGpsBannerLabel,
} from "../../../utils/driverDeliveryUi";
import { isTrackableDeliveryStatus } from "../../../utils/driverGpsTracking";
import {
  googleMapsSearchQuery,
  googleMapsSearchUrl,
  isValidCoord,
} from "../../../utils/deliveryMapUtils";
import { colors, theme, type } from "../../../theme";
import { t } from "../../../i18n";
import {
  deliveryBucket,
  DRIVER_BUCKET_LABELS,
  DRIVER_BUCKET_ORDER,
  effectiveDeliveryDate,
  type DriverDeliveryBucket,
} from "../../../utils/driverSchedule";

type DeliveryRow = {
  id: string;
  orderId: string;
  restaurantName: string;
  deliveryArea?: string | null;
  status: string;
  isNext?: boolean;
  driverAssignmentId?: string;
  bucket: DriverDeliveryBucket;
  scheduledDeliveryDate?: string | null;
};

export function DriverHomeScreen() {
  useUiLocale();

  const navigation =
    useNavigation<NativeStackNavigationProp<DriverStackParamList>>();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { data, isLoading, isError, refetch, isRefetching } = useDriverBoard();
  const { data: routeData, refetch: refetchRoute } = useDriverActiveRoute();
  const optimizeRoute = useOptimizeRoute();

  const orders = data?.orders ?? [];
  const route = routeData?.route ?? null;
  const routeOrderIds = new Set(route?.stops.map((s) => s.orderId) ?? []);

  const active = orders.filter(
    (o) =>
      !routeOrderIds.has(o.orderId) &&
      !["delivered", "failed", "rescheduled"].includes(
        String(o.deliveryStatus).toLowerCase(),
      ),
  );
  const standaloneOrders = orders.filter((o) => !routeOrderIds.has(o.orderId));
  const completed = orders.filter(
    (o) => String(o.deliveryStatus).toLowerCase() === "delivered",
  );

  const trackable = orders
    .filter((o) => isTrackableDeliveryStatus(o.deliveryStatus))
    .map((o) => ({ orderId: o.orderId, deliveryStatus: o.deliveryStatus }));

  const { trackingActive, permissionDenied, gpsMessage, trackableCount } =
    useDriverGpsTracking(trackable);

  const gpsError = gpsMessage === "Location not updating";
  const gpsBanner = getDriverGpsBannerLabel({
    trackableCount,
    trackingActive,
    permissionDenied,
    gpsError,
  });

  const deliveryRows = useMemo<DeliveryRow[]>(() => {
    const rows: DeliveryRow[] = [];
    if (route) {
      for (const stop of route.stops) {
        rows.push({
          id: stop.id,
          orderId: stop.orderId,
          restaurantName: stop.restaurantName,
          deliveryArea: stop.deliveryArea,
          status: stop.status,
          isNext: stop.isNext,
          scheduledDeliveryDate: route.scheduledDate,
          bucket: deliveryBucket({
            deliveryStatus: stop.status,
            scheduledDeliveryDate: route.scheduledDate,
          }),
        });
      }
    }
    for (const o of standaloneOrders) {
      rows.push({
        id: o.assignmentId ?? o.orderId,
        orderId: o.orderId,
        restaurantName: o.restaurantName,
        deliveryArea: o.deliveryArea,
        status: o.deliveryStatus,
        driverAssignmentId: o.assignmentId ?? undefined,
        scheduledDeliveryDate: o.scheduledDeliveryDate ?? o.scheduledAt,
        bucket: deliveryBucket(o),
      });
    }
    return rows.sort((a, b) => {
      const bucketDiff =
        DRIVER_BUCKET_ORDER.indexOf(a.bucket) -
        DRIVER_BUCKET_ORDER.indexOf(b.bucket);
      if (bucketDiff) return bucketDiff;
      const dateDiff = (effectiveDeliveryDate(a) ?? "9999-12-31").localeCompare(
        effectiveDeliveryDate(b) ?? "9999-12-31",
      );
      if (dateDiff) return a.bucket === "upcoming" ? dateDiff : -dateDiff;
      return String(a.id)
        .concat(":", String(a.orderId))
        .localeCompare(String(b.id).concat(":", String(b.orderId)));
    });
  }, [route, standaloneOrders]);

  const nextStop = route?.stops.find((s) => s.isNext) ?? route?.stops[0];
  const nextStandalone = active[0];
  const workspaceTitle =
    user?.displayName ?? user?.workspace?.tenantName ?? "Driver";

  const onRefresh = useCallback(() => {
    refetch();
    refetchRoute();
  }, [refetch, refetchRoute]);

  const handleOptimize = useCallback(() => {
    if (!route) return;
    Alert.alert(
      uiCopy("Optimize route?"),
      uiCopy("Reorder stops for the shortest driving path."),
      [
        { text: uiCopy("Cancel"), style: "cancel" },
        {
          text: uiCopy("Optimize"),
          onPress: () =>
            optimizeRoute.mutate(
              { routeId: route.id, apply: true },
              {
                onSuccess: (result) => {
                  const msg =
                    result.savedKm != null
                      ? `Route optimized — saved ${result.savedKm.toFixed(1)} km`
                      : "Route optimized.";
                  Alert.alert(uiCopy("Done"), msg);
                  refetchRoute();
                },
                onError: (e) =>
                  Alert.alert(uiCopy("Could not optimize"), e.message),
              },
            ),
        },
      ],
    );
  }, [route, optimizeRoute, refetchRoute]);

  if (isLoading) {
    return (
      <View style={styles.headerBlock}>
        <HomeChrome title={workspaceTitle} />
        <ListSkeleton rows={6} />
      </View>
    );
  }
  if (isError) {
    return (
      <Screen padded>
        <ErrorState
          message={uiCopy("Check your connection and try again.")}
          onRetry={() => refetch()}
        />
      </Screen>
    );
  }

  const nextOrderId = nextStop?.orderId ?? nextStandalone?.orderId;
  const remainingCount = deliveryRows.filter(
    (r) => String(r.status).toLowerCase() !== "delivered",
  ).length;

  // Board row for the next stop carries the coordinates needed to hand off to Maps.
  const nextBoardOrder = nextOrderId
    ? orders.find((o) => o.orderId === nextOrderId)
    : undefined;
  const nextName = nextStop?.restaurantName ?? nextStandalone?.restaurantName;
  const nextArea =
    nextStop?.deliveryArea ??
    nextStandalone?.deliveryArea ??
    nextBoardOrder?.destinationLabel ??
    null;
  const nextStatus = nextStop?.status ?? nextStandalone?.deliveryStatus;
  const nextSequence =
    route && nextStop
      ? `Stop ${route.stops.findIndex((s) => s.id === nextStop.id) + 1} of ${route.stops.length}`
      : null;
  const nextMapsUrl = isValidCoord(
    nextBoardOrder?.destinationLatitude,
    nextBoardOrder?.destinationLongitude,
  )
    ? googleMapsSearchUrl(
        Number(nextBoardOrder?.destinationLatitude),
        Number(nextBoardOrder?.destinationLongitude),
      )
    : nextArea && nextArea.toLowerCase() !== "unassigned area"
      ? googleMapsSearchQuery(nextArea)
      : null;

  const openStop = (orderId: string, driverAssignmentId?: string) =>
    navigation.navigate("DriverStop", {
      orderId,
      driverAssignmentId:
        driverAssignmentId ??
        data?.orders.find((o) => o.orderId === orderId)?.assignmentId ??
        undefined,
    });

  const ListHeader = (
    <View style={styles.headerBlock}>
      <HomeChrome
        title={workspaceTitle}
        subtitle={uiCopy("{{v0}} stops on your route", { v0: remainingCount })}
      />

      {gpsBanner ? (
        <View
          style={[
            styles.gpsBanner,
            permissionDenied || gpsError
              ? styles.gpsBannerError
              : styles.gpsBannerOk,
          ]}
        >
          <Text
            style={[
              styles.gpsBannerText,
              {
                color:
                  permissionDenied || gpsError ? colors.danger : colors.brand,
              },
            ]}
          >
            {gpsBanner}
          </Text>
        </View>
      ) : null}

      <MetricStrip>
        <Metric value={remainingCount} label={uiCopy("Remaining")} />
        <Metric value={completed.length} label={uiCopy("Done today")} />
      </MetricStrip>

      {nextOrderId ? (
        <View style={styles.nextBlock}>
          <SectionHeader>{t("upNext")}</SectionHeader>
          <View style={styles.nextCard}>
            <View style={styles.nextTopRow}>
              {nextSequence ? (
                <Text style={type.overline}>{nextSequence}</Text>
              ) : null}
              {nextStatus ? (
                <StatusPill status={nextStatus} domain="delivery" />
              ) : null}
            </View>
            <Text style={styles.nextName} numberOfLines={2}>
              {nextName}
            </Text>
            <Text style={styles.nextArea} numberOfLines={2}>
              {nextArea ?? uiCopy("Address not set")}
            </Text>
            <View style={styles.nextActions}>
              <Button
                label={uiCopy("Open delivery")}
                style={styles.nextPrimary}
                onPress={() =>
                  openStop(
                    nextOrderId,
                    nextStandalone?.assignmentId ??
                      data?.orders.find((o) => o.orderId === nextOrderId)
                        ?.assignmentId ??
                      undefined,
                  )
                }
              />
              {nextMapsUrl ? (
                <Button
                  label={uiCopy("Navigate")}
                  variant="outline"
                  icon="navigate-outline"
                  onPress={() => void Linking.openURL(nextMapsUrl)}
                />
              ) : null}
            </View>
          </View>
        </View>
      ) : (
        <EmptyState
          icon="checkmark-done-outline"
          title={uiCopy("No deliveries right now")}
          message={uiCopy("Check back later for new stops.")}
        />
      )}

      <View style={styles.toolRow}>
        {route ? (
          <TextButton
            label={uiCopy("Optimize route")}
            onPress={handleOptimize}
          />
        ) : null}
        <TextButton
          label={uiCopy("Run sheet")}
          onPress={() => navigation.navigate("DriverRunSheet")}
        />
      </View>

      {deliveryRows.length > 0 ? (
        <SectionHeader>{uiCopy("Stops")}</SectionHeader>
      ) : null}
    </View>
  );

  return (
    <Screen scroll={false} padded={false}>
      <FlashList
        data={deliveryRows}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
          />
        }
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{
          paddingBottom: insets.bottom + theme.spacing.lg,
        }}
        renderItem={({ item, index }) => (
          <View>
            {index === 0 || deliveryRows[index - 1]?.bucket !== item.bucket ? (
              <Text style={styles.bucketHeader}>
                {DRIVER_BUCKET_LABELS[item.bucket]}
              </Text>
            ) : null}
            <OperationalRow
              title={item.restaurantName}
              subtitle={item.deliveryArea ?? undefined}
              note={formatDeliveryStatusLabel(item.status)}
              status={item.status}
              domain="delivery"
              avatarLabel={item.restaurantName}
              attention={["out_for_delivery", "failed"].includes(
                String(item.status).toLowerCase(),
              )}
              onPress={() => openStop(item.orderId, item.driverAssignmentId)}
            />
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerBlock: { backgroundColor: colors.background },
  nextBlock: { marginBottom: theme.spacing.sm },
  nextCard: {
    marginHorizontal: theme.gutter,
    padding: theme.spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hairline,
    borderColor: colors.border,
  },
  nextTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  nextName: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    letterSpacing: -0.3,
  },
  nextArea: { ...type.body, color: colors.textMuted, marginTop: 2 },
  nextActions: {
    flexDirection: "row",
    gap: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  nextPrimary: { flex: 1 },
  toolRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.lg,
    paddingHorizontal: theme.gutter,
    marginBottom: theme.spacing.md,
  },
  bucketHeader: {
    ...type.overline,
    paddingHorizontal: theme.gutter,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  gpsBanner: {
    marginHorizontal: theme.gutter,
    marginBottom: theme.spacing.sm,
    padding: theme.spacing.md,
    borderRadius: theme.radius.sm,
    borderWidth: theme.hairline,
  },
  gpsBannerOk: {
    backgroundColor: colors.brandLight,
    borderColor: colors.brandBorder,
  },
  gpsBannerError: {
    backgroundColor: colors.dangerBg,
    borderColor: colors.dangerBorder,
  },
  gpsBannerText: { fontWeight: "600", fontSize: 13 },
});
