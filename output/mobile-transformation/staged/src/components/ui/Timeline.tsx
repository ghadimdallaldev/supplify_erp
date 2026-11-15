import { useAppLocale as useUiLocale } from "../../i18n";
import React from "react";
import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, type } from "../../theme";
import { Text } from "./primitives";

/** Recorded events only. A current status is never expanded into an invented event history. */
export function Timeline({
  events,
}: {
  events: Array<{ id: string; label: string; detail?: string }>;
}) {
  useUiLocale();

  return (
    <View>
      {events.map((event, index) => (
        <View key={event.id} style={styles.row}>
          <View style={styles.rail}>
            <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
            {index < events.length - 1 ? <View style={styles.line} /> : null}
          </View>
          <View style={styles.body}>
            <Text style={type.title}>{event.label}</Text>
            {event.detail ? (
              <Text style={type.caption}>{event.detail}</Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  rail: { alignItems: "center", width: 20 },
  line: {
    flex: 1,
    minHeight: 16,
    width: 1,
    backgroundColor: colors.borderStrong,
  },
  body: { flex: 1, minWidth: 0, paddingBottom: 20 },
});
