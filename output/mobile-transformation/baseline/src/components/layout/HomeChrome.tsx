import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, shadow, theme, type } from '../../theme'

export function HomeChrome({
  title,
  subtitle,
  onNotifications,
  notificationCount,
  right,
  onWorkspacePress,
  workspaceLabel = 'Switch account',
}: {
  title: string
  subtitle?: string
  onNotifications?: () => void
  notificationCount?: number
  right?: React.ReactNode
  /** Opens workspace / branch / account picker when the title area is pressed. */
  onWorkspacePress?: () => void
  workspaceLabel?: string
}) {
  const insets = useSafeAreaInsets()
  const badge = notificationCount && notificationCount > 0 ? (notificationCount > 99 ? '99+' : String(notificationCount)) : null
  const TitleWrap = onWorkspacePress ? Pressable : View
  return (
    <View style={[styles.bar, { paddingTop: insets.top + theme.spacing.sm }]}>
      <TitleWrap
        style={styles.textCol}
        onPress={onWorkspacePress}
        accessibilityRole={onWorkspacePress ? 'button' : undefined}
        accessibilityLabel={onWorkspacePress ? workspaceLabel : undefined}
      >
        <View style={styles.titleRow}>
          <Text style={[type.h1, styles.titleFlex]} numberOfLines={2}>
            {title}
          </Text>
          {onWorkspacePress ? (
            <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
          ) : null}
        </View>
        {subtitle ? (
          <Text style={type.label} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {onWorkspacePress ? (
          <Text style={styles.switchHint} numberOfLines={1}>
            {workspaceLabel}
          </Text>
        ) : null}
      </TitleWrap>
      <View style={styles.actions}>
        {right}
        {onNotifications ? (
          <Pressable
            onPress={onNotifications}
            style={styles.iconBtn}
            accessibilityRole="button"
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={22} color={colors.text} />
            {badge ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{badge}</Text>
              </View>
            ) : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  )
}

/**
 * Distributes metrics as equal columns with hairline dividers so a long formatted
 * currency value can never make the row ragged.
 */
export function MetricStrip({ children }: { children: React.ReactNode }) {
  const items = React.Children.toArray(children).filter(Boolean)
  if (items.length === 0) return null
  return (
    <View style={styles.metrics}>
      {items.map((child, index) => (
        <React.Fragment key={index}>
          {index > 0 ? <View style={styles.metricDivider} /> : null}
          <View style={styles.metricCell}>{child}</View>
        </React.Fragment>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: theme.gutter,
    paddingBottom: theme.spacing.lg,
    backgroundColor: colors.background,
    gap: theme.spacing.md,
  },
  textCol: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  titleFlex: { flexShrink: 1 },
  switchHint: {
    ...type.caption,
    color: colors.brandDark,
    marginTop: 2,
    fontWeight: '600',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  iconBtn: {
    width: theme.touchMin,
    height: theme.touchMin,
    borderRadius: theme.touchMin / 2,
    backgroundColor: colors.surface,
    borderWidth: theme.hairline,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { color: colors.onBrand, fontSize: 11, fontWeight: '700' },
  metrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: theme.gutter,
    marginBottom: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: theme.hairline,
    borderColor: colors.border,
    ...shadow.card,
  },
  metricCell: { flex: 1, minWidth: 0 },
  metricDivider: {
    width: theme.hairline,
    alignSelf: 'stretch',
    backgroundColor: colors.separator,
    marginHorizontal: theme.spacing.md,
  },
})
