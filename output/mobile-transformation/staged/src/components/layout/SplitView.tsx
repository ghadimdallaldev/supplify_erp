import { useAppLocale as useUiLocale } from "../../i18n";
import React from "react";
import { StyleSheet, View } from "react-native";
import { useAdaptiveLayout } from "../../theme/responsive";
import { colors } from "../../theme/colors";

/** A single selected record owns detail. Narrow layouts keep their normal stack routes. */
export function SplitView({
  master,
  detail,
}: {
  master: React.ReactNode;
  detail?: React.ReactNode;
}) {
  useUiLocale();

  const { wide } = useAdaptiveLayout();
  if (!wide) return <>{master}</>;
  return (
    <View style={styles.root}>
      <View style={styles.master}>{master}</View>
      <View style={styles.detail}>{detail}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: "row", minHeight: 0 },
  master: {
    width: "40%",
    minWidth: 320,
    maxWidth: 440,
    borderEndWidth: 1,
    borderEndColor: colors.border,
  },
  detail: { flex: 1, minWidth: 0, backgroundColor: colors.surface },
});
