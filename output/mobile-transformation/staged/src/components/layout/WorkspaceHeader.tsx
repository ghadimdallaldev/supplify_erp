import { useAppLocale as useUiLocale } from "../../i18n";
import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, theme, type } from "../../theme";
import { useAdaptiveLayout } from "../../theme/responsive";
import { Text } from "../ui/primitives";
import { copy, useAppLocale } from "../../i18n";

export function WorkspaceHeader({
  title,
  subtitle,
  onNotifications,
  notificationCount,
  right,
  onWorkspacePress,
  workspaceLabel = "Switch account",
}: {
  title: string;
  subtitle?: string;
  onNotifications?: () => void;
  notificationCount?: number;
  right?: React.ReactNode;
  onWorkspacePress?: () => void;
  workspaceLabel?: string;
}) {
  useUiLocale();

  useAppLocale();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 18 }]}>
      <View style={styles.identity}>
        <Text style={styles.brand}>SUPPLIFY</Text>
        <Pressable
          onPress={onWorkspacePress}
          disabled={!onWorkspacePress}
          accessibilityRole={onWorkspacePress ? "button" : undefined}
          accessibilityLabel={
            onWorkspacePress ? copy(workspaceLabel) + ": " + title : undefined
          }
          style={styles.titleRow}
        >
          <Text style={[type.h1, styles.title]} numberOfLines={2}>
            {title}
          </Text>
          {onWorkspacePress ? (
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          ) : null}
        </Pressable>
        {subtitle ? <Text style={type.caption}>{subtitle}</Text> : null}
      </View>
      <View style={styles.actions}>
        {right}
        {onNotifications ? (
          <Pressable
            onPress={onNotifications}
            style={styles.icon}
            accessibilityRole="button"
            accessibilityLabel={copy("Notifications")}
          >
            <Ionicons
              name="notifications-outline"
              size={22}
              color={colors.text}
            />
            {(notificationCount ?? 0) > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {notificationCount! > 99 ? "99+" : notificationCount}
                </Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function WorkspaceMetrics({ children }: { children: React.ReactNode }) {
  useUiLocale();

  const { expanded } = useAdaptiveLayout();
  const items = React.Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return (
    <View style={styles.metrics}>
      {items.map((child, index) => (
        <View
          key={index}
          style={[styles.cell, expanded && styles.expandedCell]}
        >
          {child}
        </View>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: theme.gutter,
    paddingBottom: 24,
  },
  identity: { flex: 1, minWidth: 0, gap: 3 },
  brand: {
    fontSize: 10,
    lineHeight: 16,
    fontWeight: "700",
    letterSpacing: 2,
    color: colors.brandDark,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 48,
  },
  title: { flexShrink: 1 },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 18,
  },
  icon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.surface,
  },
  badge: {
    position: "absolute",
    top: 3,
    end: 3,
    minWidth: 17,
    borderRadius: 9,
    backgroundColor: colors.danger,
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 17,
    color: colors.onBrand,
    fontWeight: "700",
    textAlign: "center",
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: theme.gutter,
    marginBottom: 12,
  },
  cell: {
    flexGrow: 1,
    flexBasis: 130,
    minWidth: 0,
    paddingVertical: 12,
    borderTopWidth: 2,
    borderTopColor: colors.borderStrong,
  },
  expandedCell: { flexBasis: 160 },
});
