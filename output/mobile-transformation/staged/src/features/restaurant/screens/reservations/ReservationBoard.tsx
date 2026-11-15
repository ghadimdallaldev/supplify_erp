import { copy as uiCopy, useAppLocale as useUiLocale } from "../../../../i18n";
import { useMemo, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { usePermissions } from "../../../../hooks/usePermissions";
import {
  useAssignReservationTables,
  usePromoteWaitlist,
  useReservationBoard,
  useUpdateReservationStatus,
} from "../../../../services/api/queries";
import {
  Button,
  EmptyState,
  ErrorState,
  FilterBar,
  FlashList,
  ListRow,
  Screen,
  SectionHeader,
  Sheet,
  StatusPill,
} from "../../../../components/ui";
import {
  DateField,
  localDateKey,
  parseDateKey,
} from "../../../../components/ui/DateField";
import { Text } from "../../../../components/ui/primitives";
import { SplitView } from "../../../../components/layout/SplitView";
import { colors, theme, type } from "../../../../theme";
import { useAdaptiveLayout } from "../../../../theme/responsive";
import type {
  Reservation,
  ReservationStatus,
} from "../../../../types/reservations";
import { formatShortDate } from "../../../../utils/format";
import { copy, useAppLocale } from "../../../../i18n";

const transitions: Partial<
  Record<ReservationStatus, Array<{ status: ReservationStatus; label: string }>>
> = {
  PENDING: [
    { status: "CONFIRMED", label: "Confirm" },
    { status: "CANCELLED", label: "Cancel" },
  ],
  CONFIRMED: [
    { status: "SEATED", label: "Seat guest" },
    { status: "NO_SHOW", label: "No show" },
    { status: "CANCELLED", label: "Cancel" },
  ],
  SEATED: [{ status: "COMPLETED", label: "Complete" }],
};
export function ReservationBoard() {
  useUiLocale();

  useAppLocale();
  const navigation = useNavigation<any>();
  const { wide } = useAdaptiveLayout();
  const { can, canAny } = usePermissions();
  const canEdit = canAny("RESERVATIONS_EDIT", "RESERVATIONS_MANAGE");
  const canCreate = canAny(
    "RESERVATIONS_CREATE",
    "RESERVATIONS_EDIT",
    "RESERVATIONS_MANAGE",
  );
  const [day, setDay] = useState(() => localDateKey(new Date()));
  const [view, setView] = useState("bookings");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tableIds, setTableIds] = useState<string[]>([]);
  const query = useReservationBoard(
    day,
    can("RESERVATIONS_VIEW") && Boolean(parseDateKey(day)),
  );
  const update = useUpdateReservationStatus();
  const assign = useAssignReservationTables();
  const promote = usePromoteWaitlist();
  const reservations = query.data?.reservations ?? [];
  const tables = query.data?.tables ?? [];
  const waitlist = query.data?.waitlist ?? [];
  const selected = reservations.find((row) => row.id === selectedId);
  const busy = update.isPending || assign.isPending || promote.isPending;
  const active = reservations.filter(
    (row) => !["CANCELLED", "NO_SHOW", "COMPLETED"].includes(row.status),
  );
  const open = (reservation: Reservation) => {
    setSelectedId(reservation.id);
    setTableIds(reservation.tables ?? []);
  };
  const changeStatus = async (status: ReservationStatus) => {
    if (!selected || !canEdit || busy) return;
    try {
      await update.mutateAsync({ id: selected.id, status });
      setSelectedId(null);
    } catch (error) {
      Alert.alert(
        copy("Could not update"),
        error instanceof Error ? error.message : copy("Try again."),
      );
    }
  };
  const requestStatus = (status: ReservationStatus) => {
    if (status === "CANCELLED" || status === "NO_SHOW")
      Alert.alert(
        copy("Confirm"),
        copy(
          status === "CANCELLED"
            ? "Cancel this reservation?"
            : "Mark this guest as a no-show?",
        ),
        [
          { text: copy("Close"), style: "cancel" },
          {
            text: copy("Confirm"),
            style: "destructive",
            onPress: () => void changeStatus(status),
          },
        ],
      );
    else void changeStatus(status);
  };
  const detail = selected ? (
    <ScrollView
      contentContainerStyle={styles.detail}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={type.h2}>{selected.customer_name}</Text>
      <StatusPill status={selected.status} />
      <Text style={type.body}>{formatShortDate(selected.scheduled_at)}</Text>
      <Text style={type.body}>
        {copy("Party of {{v0}}", { v0: selected.party_size })}
      </Text>
      {selected.customer_phone ? (
        <Text selectable style={type.body}>
          {selected.customer_phone}
        </Text>
      ) : null}
      {selected.notes ? <Text style={type.body}>{selected.notes}</Text> : null}
      <SectionHeader>{uiCopy("Tables")}</SectionHeader>
      {tables
        .filter((table) => table.is_active)
        .map((table) => (
          <ListRow
            key={table.id}
            title={table.name}
            subtitle={copy("{{v0}} seats", { v0: table.capacity })}
            right={
              <Text style={type.title}>
                {tableIds.includes(table.id) ? "✓" : ""}
              </Text>
            }
            onPress={
              canEdit && !busy
                ? () =>
                    setTableIds((current) =>
                      current.includes(table.id)
                        ? current.filter((id) => id !== table.id)
                        : [...current, table.id],
                    )
                : undefined
            }
          />
        ))}
      {canEdit ? (
        <Button
          label={uiCopy("Save table assignment")}
          variant="outline"
          loading={assign.isPending}
          disabled={
            busy ||
            JSON.stringify([...tableIds].sort()) ===
              JSON.stringify([...(selected.tables ?? [])].sort())
          }
          onPress={() =>
            void assign
              .mutateAsync({ id: selected.id, tableIds })
              .catch((error) =>
                Alert.alert(
                  copy("Could not update"),
                  error instanceof Error ? error.message : copy("Try again."),
                ),
              )
          }
        />
      ) : null}
      {canEdit
        ? (transitions[selected.status] ?? []).map((action) => (
            <Button
              key={action.status}
              label={copy(action.label)}
              variant={action.status === "CANCELLED" ? "danger" : "primary"}
              disabled={busy}
              onPress={() => requestStatus(action.status)}
            />
          ))
        : null}
    </ScrollView>
  ) : (
    <EmptyState
      icon="calendar-outline"
      title={uiCopy("Reservations")}
      message={uiCopy(
        "Select a booking to view its guest, tables, and available actions.",
      )}
    />
  );
  const master = (
    <Screen
      title={uiCopy("Reservations")}
      padded={false}
      right={
        canCreate ? (
          <Button
            label={uiCopy("New")}
            icon="add"
            onPress={() => navigation.navigate("CreateReservation")}
          />
        ) : undefined
      }
    >
      <View style={styles.filters}>
        <DateField
          label={uiCopy("Date")}
          value={day}
          onChange={(value) => {
            setDay(value);
            setSelectedId(null);
          }}
        />
      </View>
      <Text style={styles.summary}>
        {copy("{{v0}} active bookings · {{v1}} covers", {
          v0: active.length,
          v1: active.reduce((sum, row) => sum + row.party_size, 0),
        })}
      </Text>
      <FilterBar
        value={view}
        onChange={setView}
        options={[
          {
            key: "bookings",
            label: copy("Bookings"),
            count: reservations.length,
          },
          { key: "tables", label: copy("Tables"), count: tables.length },
          { key: "waitlist", label: copy("Waitlist"), count: waitlist.length },
        ]}
      />
      {query.isError ? (
        <ErrorState
          message={uiCopy("Could not load reservations.")}
          onRetry={() => void query.refetch()}
        />
      ) : view === "tables" ? (
        <FlashList
          data={tables}
          keyExtractor={(row) => row.id}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={copy("{{v0}} seats", { v0: item.capacity })}
              right={
                <Text style={type.caption}>
                  {item.is_active ? copy("Active") : copy("Inactive")}
                </Text>
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState title={uiCopy("No tables configured")} />
          }
        />
      ) : view === "waitlist" ? (
        <FlashList
          data={waitlist}
          keyExtractor={(row) => row.id}
          renderItem={({ item }) => (
            <ListRow
              title={item.customer_name}
              subtitle={copy("Party of {{v0}}", { v0: item.party_size })}
              right={
                canEdit ? (
                  <Button
                    label={uiCopy("Promote")}
                    disabled={busy}
                    variant="outline"
                    onPress={() =>
                      Alert.alert(copy("Promote"), item.customer_name, [
                        { text: copy("Cancel"), style: "cancel" },
                        {
                          text: copy("Promote"),
                          onPress: () =>
                            void promote
                              .mutateAsync(item.id)
                              .catch((error) =>
                                Alert.alert(
                                  copy("Could not promote"),
                                  error instanceof Error
                                    ? error.message
                                    : copy("Try again."),
                                ),
                              ),
                        },
                      ])
                    }
                  />
                ) : undefined
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState title={uiCopy("No waiting guests")} />
          }
        />
      ) : (
        <FlashList
          data={reservations}
          keyExtractor={(row) => row.id}
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          ListEmptyComponent={
            <EmptyState
              icon="calendar-outline"
              title={
                query.isLoading ? uiCopy("Loading…") : uiCopy("No reservations")
              }
              message={uiCopy("Bookings for the selected day appear here.")}
            />
          }
          renderItem={({ item }) => (
            <ListRow
              title={item.customer_name}
              subtitle={
                formatShortDate(item.scheduled_at) +
                " · " +
                copy("Party of {{v0}}", { v0: item.party_size })
              }
              right={<StatusPill status={item.status} />}
              onPress={() => open(item)}
            />
          )}
        />
      )}
      {!wide ? (
        <Sheet
          scrollable={false}
          dismissible={!busy}
          visible={Boolean(selected)}
          title={copy("Booking")}
          onClose={() => {
            if (!busy) setSelectedId(null);
          }}
        >
          {detail}
        </Sheet>
      ) : null}
    </Screen>
  );
  return <SplitView master={master} detail={detail} />;
}
const styles = StyleSheet.create({
  filters: { paddingHorizontal: theme.gutter, paddingBottom: 12 },
  summary: {
    ...type.caption,
    paddingHorizontal: theme.gutter,
    paddingBottom: 12,
  },
  detail: { padding: 20, gap: 14 },
});
