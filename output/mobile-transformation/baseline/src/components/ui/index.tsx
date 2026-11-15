import React from 'react'
import {
  ActivityIndicator,
  I18nManager,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useHeaderHeight } from '@react-navigation/elements'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors, shadow, theme, type } from '../../theme'
import { prettyStatus, statusColors, statusToneFor, type StatusDomain, type StatusTone } from '../../theme/colors'

export type IoniconName = React.ComponentProps<typeof Ionicons>['name']

export function Screen({
  children,
  title,
  subtitle,
  right,
  scroll,
  padded = true,
  contentStyle,
  showBack,
  onBack,
}: {
  children: React.ReactNode
  title?: string
  subtitle?: string
  right?: React.ReactNode
  scroll?: boolean
  padded?: boolean
  contentStyle?: ViewStyle
  /** Force show/hide back. Default: show when this navigator or its parent can go back. */
  showBack?: boolean
  onBack?: () => void
}) {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<any>()
  const nativeHeaderHeight = useHeaderHeight()
  const parent = typeof navigation.getParent === 'function' ? navigation.getParent() : null
  const canGoBack =
    (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) ||
    (parent && typeof parent.canGoBack === 'function' && parent.canGoBack())
  // Avoid a second back control when the native stack header is already visible.
  const nativeHeaderVisible = nativeHeaderHeight > 0
  const backVisible = showBack ?? Boolean(title && canGoBack && !nativeHeaderVisible)
  const handleBack = () => {
    if (onBack) {
      onBack()
      return
    }
    if (typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
      navigation.goBack()
      return
    }
    parent?.goBack?.()
  }
  const Body = scroll ? ScrollView : View
  const bodyProps = scroll
    ? {
        contentContainerStyle: [
          padded && styles.screenPad,
          { paddingBottom: insets.bottom + theme.spacing.lg },
          contentStyle,
        ],
        showsVerticalScrollIndicator: false,
      }
    : { style: [styles.flex, padded && styles.screenPad, contentStyle] }

  return (
    <View style={[styles.screen, { paddingTop: title ? insets.top : 0 }]}>
      {title ? (
        <View style={styles.header}>
          {backVisible ? (
            <Pressable
              onPress={handleBack}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
            >
              <Ionicons
                name={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'}
                size={24}
                color={colors.text}
              />
            </Pressable>
          ) : null}
          <View style={styles.flex}>
            <Text style={type.h1} numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.headerSub}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      ) : null}
      <Body {...(bodyProps as any)}>{children}</Body>
    </View>
  )
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
}: {
  label: string
  onPress: () => void
  variant?: 'primary' | 'success' | 'outline' | 'danger' | 'ghost'
  icon?: IoniconName
  disabled?: boolean
  loading?: boolean
  style?: ViewStyle
}) {
  const v = BTN_VARIANTS[variant]
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: v.bg, borderColor: v.border, borderWidth: v.border ? 1 : 0 },
        variant === 'primary' && shadow.brand,
        (disabled || loading) && styles.btnDisabled,
        pressed && !disabled && styles.btnPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.btnInner}>
          {icon ? <Ionicons name={icon} size={18} color={v.fg} /> : null}
          <Text style={[styles.btnText, { color: v.fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

const BTN_VARIANTS: Record<string, { bg: string; fg: string; border?: string }> = {
  primary: { bg: colors.brand, fg: colors.onBrand },
  success: { bg: colors.brand, fg: colors.onBrand },
  outline: { bg: colors.surface, fg: colors.text, border: colors.borderStrong },
  danger: { bg: colors.surface, fg: colors.danger, border: colors.dangerBorder },
  ghost: { bg: 'transparent', fg: colors.brand },
}

export function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.textBtn} accessibilityRole="button">
      <Text style={styles.textBtnLabel}>{label}</Text>
    </Pressable>
  )
}

export function Card({
  children,
  style,
  onPress,
  elevated = false,
}: {
  children: React.ReactNode
  style?: ViewStyle
  onPress?: () => void
  elevated?: boolean
}) {
  const content = <View style={[styles.card, elevated && shadow.sm, style]}>{children}</View>
  if (!onPress) return content
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.cardPressed]} accessibilityRole="button">
      {content}
    </Pressable>
  )
}

export function StatusPill({
  status,
  tone,
  domain = 'generic',
}: {
  status: string | null | undefined
  tone?: StatusTone
  domain?: StatusDomain
}) {
  const safeStatus = status ?? 'UNKNOWN'
  const t = tone ?? statusToneFor(safeStatus, domain)
  const c = statusColors(t)
  return (
    <View style={[styles.pill, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.pillText, { color: c.fg }]} numberOfLines={1}>
        {prettyStatus(safeStatus)}
      </Text>
    </View>
  )
}

function AvatarInitial({ label }: { label: string }) {
  const initial = (label.trim()[0] ?? '?').toUpperCase()
  return (
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{initial}</Text>
    </View>
  )
}

/** Dense hairline row — no pastel icon tile by default. */
export function ListRow({
  icon,
  iconTone: _iconTone,
  avatarLabel,
  title,
  subtitle,
  note,
  right,
  onPress,
  style,
  showChevron,
  tone,
  strong,
  compact,
}: {
  icon?: IoniconName
  /** @deprecated Visual tone tiles removed; kept for call-site compatibility */
  iconTone?: StatusTone
  avatarLabel?: string
  title: string
  subtitle?: string
  /** Third line for low-salience metadata (order ref, item count). */
  note?: string
  right?: React.ReactNode
  onPress?: () => void
  style?: ViewStyle
  showChevron?: boolean
  /** Semantic accent + icon colour for rows that need action. */
  tone?: StatusTone
  /** Emphasises the title, e.g. an unread conversation. */
  strong?: boolean
  /** Single-line directory row — drops the vertical padding a notch. */
  compact?: boolean
}) {
  const chevron =
    showChevron !== false && onPress && !right ? (
      <Ionicons
        name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
        size={18}
        color={colors.textFaint}
      />
    ) : null
  const accent = tone ? statusColors(tone).fg : null
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        compact && styles.rowCompact,
        pressed && onPress && styles.rowPressed,
        style,
      ]}
    >
      {accent ? <View style={[styles.rowAccent, { backgroundColor: accent }]} /> : null}
      {avatarLabel ? <AvatarInitial label={avatarLabel} /> : null}
      {!avatarLabel && icon ? (
        <Ionicons
          name={icon}
          size={18}
          color={accent ?? colors.textMuted}
          style={styles.rowLeadingIcon}
        />
      ) : null}
      <View style={styles.flex}>
        <Text style={strong ? type.titleStrong : type.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.rowSub} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {note ? (
          <Text style={styles.rowNote} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      {right ?? chevron}
    </Pressable>
  )
}

export function IconButton({
  icon,
  label,
  onPress,
  tone = 'neutral',
}: {
  icon: IoniconName
  label: string
  onPress: () => void
  tone?: StatusTone
}) {
  const c = statusColors(tone)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { borderColor: c.border }, pressed && styles.rowPressed]}
    >
      <Ionicons name={icon} size={20} color={c.fg} />
    </Pressable>
  )
}

export function OperationalRow({
  title,
  subtitle,
  note,
  meta,
  status,
  domain = 'generic',
  avatarLabel,
  onPress,
  attention,
}: {
  title: string
  subtitle?: string
  note?: string
  meta?: string
  status?: string | null
  domain?: StatusDomain
  avatarLabel?: string
  onPress?: () => void
  /** Flags the row as needing action; draws a semantic accent from the status tone. */
  attention?: boolean
}) {
  const tone = status ? statusToneFor(status, domain) : undefined
  return (
    <ListRow
      title={title}
      subtitle={subtitle}
      note={note}
      avatarLabel={avatarLabel}
      onPress={onPress}
      tone={attention ? tone : undefined}
      right={
        meta || status ? (
          <View style={styles.rowRight}>
            {meta ? (
              <Text style={styles.rowAmount} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
            {status ? <StatusPill status={status} domain={domain} /> : null}
          </View>
        ) : undefined
      }
    />
  )
}

export function Group({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.group, style]}>{children}</View>
}

export function Metric({
  value,
  label,
  style,
  tone,
}: {
  value: string | number
  label: string
  style?: ViewStyle
  /** Tints the value when the number itself carries a warning, e.g. overdue. */
  tone?: StatusTone
}) {
  const text = String(value)
  // Formatted currency and 4-digit counts need the smaller step to stay on one line.
  const valueStyle = text.length > 6 ? type.metricSm : type.metric
  const fg = tone ? statusColors(tone).fg : undefined
  return (
    <View style={[styles.metric, style]}>
      <Text style={[valueStyle, fg ? { color: fg } : null]} numberOfLines={1} adjustsFontSizeToFit>
        {text}
      </Text>
      <Text style={type.caption} numberOfLines={2}>
        {label}
      </Text>
    </View>
  )
}

/** @deprecated Prefer Metric — kept for gradual migration */
export function StatCard({
  value,
  label,
  icon: _icon,
  tone: _tone,
  style,
}: {
  value: string | number
  label: string
  icon?: IoniconName
  tone?: StatusTone
  style?: ViewStyle
}) {
  return <Metric value={value} label={label} style={style} />
}

export function SectionHeader({
  children,
  style,
  action,
  onAction,
}: {
  children: React.ReactNode
  style?: TextStyle
  /** Optional trailing link, e.g. "See all". */
  action?: string
  onAction?: () => void
}) {
  if (!action || !onAction) return <Text style={[styles.section, style]}>{children}</Text>
  return (
    <View style={styles.sectionRow}>
      <Text style={[styles.section, styles.sectionFlex, style]}>{children}</Text>
      <Pressable onPress={onAction} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.sectionAction}>{action}</Text>
      </Pressable>
    </View>
  )
}

export function Divider() {
  return <View style={styles.divider} />
}

export function Skeleton({ height = 14, style }: { height?: number; style?: ViewStyle }) {
  return <View style={[styles.skeleton, { height }, style]} />
}

/** Row-shaped placeholder that matches ListRow, so lists do not jump on load. */
export function ListSkeleton({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <View>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.skeletonRow}>
          {avatar ? <Skeleton height={36} style={styles.skeletonAvatar} /> : null}
          <View style={styles.flex}>
            <Skeleton height={12} style={styles.skeletonTitle} />
            <Skeleton height={10} style={styles.skeletonSub} />
          </View>
          <Skeleton height={10} style={styles.skeletonMeta} />
        </View>
      ))}
    </View>
  )
}

export function EmptyState({
  title,
  message,
  icon = 'cube-outline',
  actionLabel,
  onAction,
}: {
  title: string
  message?: string
  icon?: IoniconName
  actionLabel?: string
  onAction?: () => void
}) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.brandLight }]}>
        <Ionicons name={icon} size={28} color={colors.brandDark} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMsg}>{message}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} onPress={onAction} variant="outline" style={styles.retryBtn} />
      ) : null}
    </View>
  )
}

export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title?: string
  message?: string
  onRetry?: () => void
}) {
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: colors.dangerBg }]}>
        <Ionicons name="cloud-offline-outline" size={28} color={colors.danger} />
      </View>
      <Text style={styles.emptyTitle}>{title ?? 'Something went wrong'}</Text>
      {message ? <Text style={styles.emptyMsg}>{message}</Text> : null}
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="outline" style={styles.retryBtn} /> : null}
    </View>
  )
}

export function LoadingState({ message = 'Loading…' }: { message?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  )
}

export { FlashList } from '@shopify/flash-list'
export { SearchField } from './SearchField'
export { FilterBar } from './FilterBar'
export { Sheet } from './Sheet'

export function ToastBanner({
  message,
  tone = 'info',
}: {
  message: string
  tone?: 'info' | 'error' | 'success'
}) {
  const bg = tone === 'error' ? colors.dangerBg : tone === 'success' ? colors.successBg : colors.infoBg
  const fg = tone === 'error' ? colors.danger : tone === 'success' ? colors.success : colors.info
  return (
    <View style={[styles.toast, { backgroundColor: bg, borderColor: fg }]}>
      <Text style={[styles.toastText, { color: fg }]} numberOfLines={2}>
        {message}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1, minWidth: 0 },
  screen: { flex: 1, backgroundColor: colors.background },
  screenPad: { paddingHorizontal: theme.gutter, paddingVertical: theme.spacing.md },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.gutter,
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
  },
  headerSub: { ...type.label, marginTop: 2 },
  backBtn: {
    width: 40,
    height: 40,
    marginStart: -6,
    alignItems: 'center',
    justifyContent: 'center',
  },

  btn: {
    minHeight: 50,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  btnInner: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  btnDisabled: { opacity: 0.45 },
  btnPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  btnText: { fontSize: 16, fontWeight: '600', letterSpacing: -0.1 },
  textBtn: { paddingVertical: theme.spacing.sm, paddingHorizontal: theme.spacing.xs },
  textBtnLabel: { color: colors.brand, fontSize: 15, fontWeight: '600' },

  card: {
    backgroundColor: colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    borderWidth: theme.hairline,
    borderColor: colors.border,
    marginBottom: theme.spacing.md,
    ...shadow.card,
  },
  cardPressed: { opacity: 0.94, transform: [{ scale: 0.99 }] },

  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    borderWidth: theme.hairline,
    maxWidth: 150,
  },
  pillText: { fontSize: 12, fontWeight: '600' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.gutter,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: theme.hairline,
    borderBottomColor: colors.separator,
  },
  rowCompact: { paddingVertical: theme.spacing.sm + 2 },
  rowPressed: { backgroundColor: colors.surfaceMuted },
  rowLeadingIcon: { width: 22 },
  rowRight: { alignItems: 'flex-end', gap: theme.spacing.xs, flexShrink: 0, maxWidth: 124 },
  rowMeta: { ...type.caption, textAlign: 'right' },
  /** Money on an operational row: the number the eye should land on. */
  rowAmount: { fontSize: 15, fontWeight: '700', color: colors.text, textAlign: 'right' },
  rowSub: { ...type.label, marginTop: 2 },
  rowNote: { ...type.caption, color: colors.textFaint, marginTop: 2 },
  /** Semantic accent for rows that represent something needing action. */
  rowAccent: { width: 8, height: 8, borderRadius: 4, marginEnd: -theme.spacing.xs },

  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: colors.brandDark },

  group: {
    backgroundColor: colors.surface,
    borderTopWidth: theme.hairline,
    borderBottomWidth: theme.hairline,
    borderColor: colors.separator,
    marginBottom: theme.spacing.md,
  },
  iconButton: {
    width: theme.touchMin,
    height: theme.touchMin,
    borderRadius: theme.radius.md,
    borderWidth: theme.hairline,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  metric: { minWidth: 72, flexShrink: 1 },
  section: { ...type.overline, paddingHorizontal: theme.gutter, marginBottom: theme.spacing.xs, marginTop: theme.spacing.sm },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', paddingRight: theme.gutter },
  sectionFlex: { flex: 1 },
  sectionAction: { ...type.label, color: colors.brand, fontWeight: '600' },
  divider: { height: theme.hairline, backgroundColor: colors.separator, marginVertical: theme.spacing.sm },

  skeleton: { backgroundColor: colors.backgroundAlt, borderRadius: theme.radius.sm },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.gutter,
    paddingVertical: theme.spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: theme.hairline,
    borderBottomColor: colors.separator,
  },
  skeletonAvatar: { width: 36, borderRadius: 18 },
  skeletonTitle: { width: '62%', marginBottom: 6 },
  skeletonSub: { width: '38%' },
  skeletonMeta: { width: 52 },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: theme.spacing.xxl + 8, paddingHorizontal: theme.spacing.xl, gap: 10 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyMsg: { color: colors.textMuted, textAlign: 'center', fontSize: 14.5, lineHeight: 20 },
  retryBtn: { marginTop: theme.spacing.md, alignSelf: 'stretch', maxWidth: 240 },

  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background },
  loadingText: { color: colors.textMuted, fontWeight: '500' },
  toast: {
    position: 'absolute',
    bottom: 24,
    left: 16,
    right: 16,
    padding: 14,
    borderRadius: theme.radius.md,
    borderWidth: theme.hairline,
    zIndex: 9999,
    elevation: 8,
  },
  toastText: { fontWeight: '600', fontSize: 14.5, textAlign: 'center' },
})
