import React from 'react'
import {
  ActivityIndicator,
  I18nManager,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native'
import { Image } from 'expo-image'
import { Ionicons } from '@expo/vector-icons'
import { colors, shadow, theme, type } from '../../theme'
import {
  prettyStatus,
  statusColors,
  statusToneFor,
  type StatusDomain,
} from '../../theme/colors'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function InlineStatusPill({
  status,
  domain = 'generic',
}: {
  status: string | null | undefined
  domain?: StatusDomain
}) {
  const safe = status ?? 'UNKNOWN'
  const c = statusColors(statusToneFor(safe, domain))
  return (
    <View style={[styles.badge, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.badgeText, { color: c.fg }]} numberOfLines={1}>
        {prettyStatus(safe)}
      </Text>
    </View>
  )
}

/** Compact pricing / stock / contract badge. */
export function V2StatusBadge({
  label,
  tone = 'brand',
}: {
  label: string
  tone?: 'brand' | 'success' | 'warning' | 'neutral' | 'info'
}) {
  const palette = {
    brand: { fg: colors.brandDark, bg: colors.brandLight, border: colors.brandBorder },
    success: { fg: colors.success, bg: colors.successBg, border: colors.successBorder },
    warning: { fg: colors.warning, bg: colors.warningBg, border: colors.warningBorder },
    info: { fg: colors.info, bg: colors.infoBg, border: colors.infoBorder },
    neutral: { fg: colors.textMuted, bg: colors.neutralBg, border: colors.neutralBorder },
  }[tone]
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg, borderColor: palette.border }]}>
      <Text style={[styles.badgeText, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  )
}

export function V2QuantityControl({
  quantity,
  onDecrement,
  onIncrement,
  disabled,
}: {
  quantity: number
  onDecrement: () => void
  onIncrement: () => void
  disabled?: boolean
}) {
  return (
    <View style={styles.qtyRow}>
      <Pressable
        onPress={onDecrement}
        disabled={disabled}
        style={({ pressed }) => [styles.qtyBtn, pressed && styles.pressed, disabled && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
      >
        <Ionicons name="remove" size={18} color={colors.text} />
      </Pressable>
      <Text style={styles.qtyValue}>{quantity}</Text>
      <Pressable
        onPress={onIncrement}
        disabled={disabled}
        style={({ pressed }) => [styles.qtyBtn, pressed && styles.pressed, disabled && styles.disabled]}
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
      >
        <Ionicons name="add" size={18} color={colors.text} />
      </Pressable>
    </View>
  )
}

export function V2ProductRow({
  name,
  meta,
  price,
  strikePrice,
  badges,
  stockLabel,
  imageUri,
  cartQuantity = 0,
  onAdd,
  addDisabled,
  trailing,
  onPress,
}: {
  name: string
  meta?: string
  price?: string
  strikePrice?: string
  badges?: Array<{ label: string; tone?: 'brand' | 'success' | 'warning' | 'neutral' | 'info' }>
  stockLabel?: string
  imageUri?: string | null
  cartQuantity?: number
  onAdd?: () => void
  addDisabled?: boolean
  trailing?: React.ReactNode
  onPress?: () => void
}) {
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  const body = (
    <View style={[styles.productRow, trailing != null && styles.productRowWithActions]}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.thumb} contentFit="cover" recyclingKey={name} />
      ) : (
        <View style={styles.thumbPlaceholder}>
          <Text style={styles.thumbLetter}>{initial}</Text>
        </View>
      )}
      <View style={styles.productInfo}>
        <Text style={type.title} numberOfLines={2}>
          {name}
        </Text>
        {meta ? (
          <Text style={styles.meta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        <View style={styles.priceRow}>
          {price ? <Text style={styles.price}>{price}</Text> : null}
          {strikePrice ? <Text style={styles.strike}>{strikePrice}</Text> : null}
          {(badges ?? []).map((b) => (
            <V2StatusBadge key={b.label} label={b.label} tone={b.tone} />
          ))}
        </View>
        {stockLabel ? (
          <Text style={styles.meta} numberOfLines={1}>
            {stockLabel}
          </Text>
        ) : null}
      </View>
      {trailing != null ? <View style={styles.productTrailing}>{trailing}</View> :
        (onAdd ? (
          <Pressable
            onPress={onAdd}
            disabled={addDisabled}
            style={({ pressed }) => [
              styles.addSquare,
              cartQuantity > 0 && styles.addSquareActive,
              pressed && styles.pressed,
              addDisabled && styles.disabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel={cartQuantity ? `In cart ${cartQuantity}, add another` : 'Add to cart'}
          >
            <Ionicons
              name={cartQuantity > 0 ? 'checkmark' : 'add'}
              size={20}
              color={cartQuantity > 0 ? colors.onBrand : colors.brandDark}
            />
          </Pressable>
        ) : null)}
    </View>
  )
  if (!onPress) return body
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {body}
    </Pressable>
  )
}

export function V2SupplierRow({
  name,
  note,
  followed,
  onPress,
  onToggleFollow,
  onMessage,
  canFollow,
  canMessage,
}: {
  name: string
  note?: string
  followed?: boolean
  onPress: () => void
  onToggleFollow?: () => void
  onMessage?: () => void
  canFollow?: boolean
  canMessage?: boolean
}) {
  const initial = (name.trim()[0] ?? '?').toUpperCase()
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.supplierRow, pressed && styles.pressed]}
      accessibilityRole="button"
    >
      <View style={styles.supplierAvatar}>
        <Text style={styles.supplierAvatarText}>{initial}</Text>
      </View>
      <View style={styles.productInfo}>
        <Text style={type.title} numberOfLines={1}>
          {name}
        </Text>
        {note ? (
          <Text style={styles.meta} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      <View style={styles.supplierActions}>
        {canMessage && onMessage ? (
          <Pressable
            hitSlop={10}
            onPress={onMessage}
            accessibilityRole="button"
            accessibilityLabel={`Message ${name}`}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
        {canFollow && onToggleFollow ? (
          <Pressable
            hitSlop={10}
            onPress={onToggleFollow}
            accessibilityRole="button"
            accessibilityState={{ selected: Boolean(followed) }}
            accessibilityLabel={followed ? `Unfollow ${name}` : `Follow ${name}`}
          >
            <Ionicons
              name={followed ? 'heart' : 'heart-outline'}
              size={22}
              color={followed ? colors.danger : colors.textMuted}
            />
          </Pressable>
        ) : null}
        <Ionicons
          name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
          size={18}
          color={colors.textFaint}
        />
      </View>
    </Pressable>
  )
}

export function V2OrderRow({
  title,
  subtitle,
  note,
  meta,
  status,
  domain = 'order',
  onPress,
}: {
  title: string
  subtitle?: string
  note?: string
  meta?: string
  status?: string | null
  domain?: StatusDomain
  onPress?: () => void
}) {
  const initial = (title.trim()[0] ?? '?').toUpperCase()
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.orderRow, pressed && onPress && styles.pressed]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={styles.supplierAvatar}>
        <Text style={styles.supplierAvatarText}>{initial}</Text>
      </View>
      <View style={styles.productInfo}>
        <Text style={type.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.meta} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {note ? (
          <Text style={styles.metaFaint} numberOfLines={1}>
            {note}
          </Text>
        ) : null}
      </View>
      <View style={styles.orderRight}>
        {meta ? (
          <Text style={styles.orderMeta} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
        {status ? <InlineStatusPill status={status} domain={domain} /> : null}
      </View>
    </Pressable>
  )
}

export function V2StickyCheckoutBar({
  totalLabel,
  total,
  actionLabel,
  onAction,
  loading,
  disabled,
  secondaryLabel,
  onSecondary,
}: {
  totalLabel: string
  total: string
  actionLabel: string
  onAction: () => void
  loading?: boolean
  disabled?: boolean
  secondaryLabel?: string
  onSecondary?: () => void
}) {
  return (
    <View style={[styles.stickyBar, shadow.sheet]}>
      <View style={styles.stickyTotal}>
        <Text style={styles.meta}>{totalLabel}</Text>
        <Text style={styles.stickyAmount}>{total}</Text>
      </View>
      <Pressable
        onPress={onAction}
        disabled={disabled || loading}
        style={({ pressed }) => [
          styles.stickyCta,
          (disabled || loading) && styles.disabled,
          pressed && !disabled && styles.pressed,
        ]}
        accessibilityRole="button"
      >
        {loading ? (
          <ActivityIndicator color={colors.onBrand} />
        ) : (
          <Text style={styles.stickyCtaText}>{actionLabel}</Text>
        )}
      </Pressable>
      {secondaryLabel && onSecondary ? (
        <Pressable onPress={onSecondary} style={styles.stickySecondary} accessibilityRole="button">
          <Text style={styles.stickySecondaryText}>{secondaryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

export function V2QuickActionTile({
  icon,
  label,
  onPress,
}: {
  icon: IoniconName
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickTile, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.quickIcon}>
        <Ionicons name={icon} size={20} color={colors.brandDark} />
      </View>
      <Text style={styles.quickLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  )
}

export function V2SectionHeader({
  children,
  action,
  onAction,
  style,
}: {
  children: React.ReactNode
  action?: string
  onAction?: () => void
  style?: ViewStyle
}) {
  return (
    <View style={[styles.sectionRow, style]}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button">
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: theme.hairline,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: theme.radius.pill,
  },
  badgeText: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.1 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  qtyBtn: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    borderWidth: theme.hairline,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: { minWidth: 30, textAlign: 'center', fontSize: 17, fontWeight: '700', color: colors.text },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.gutter,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: theme.hairline,
    borderBottomColor: colors.separator,
    backgroundColor: colors.surface,
  },
  productRowWithActions: { flexWrap: 'wrap' },
  productTrailing: { width: '100%', alignItems: 'flex-end' },
  thumb: {
    width: 58,
    height: 58,
    borderRadius: theme.radius.md,
    backgroundColor: colors.backgroundAlt,
  },
  thumbPlaceholder: {
    width: 58,
    height: 58,
    borderRadius: theme.radius.md,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbLetter: { fontSize: 18, fontWeight: '700', color: colors.brandDark },
  productInfo: { flex: 1, minWidth: 0 },
  meta: { ...type.caption, marginTop: 2, color: colors.textMuted },
  metaFaint: { ...type.caption, marginTop: 2 },
  priceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  price: { fontSize: 15, fontWeight: '700', color: colors.text },
  strike: { ...type.caption, textDecorationLine: 'line-through' },
  addSquare: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addSquareActive: { backgroundColor: colors.brand },
  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.gutter,
    paddingVertical: 14,
    borderBottomWidth: theme.hairline,
    borderBottomColor: colors.separator,
    backgroundColor: colors.surface,
  },
  supplierAvatar: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.md,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplierAvatarText: { fontSize: 16, fontWeight: '700', color: colors.brandDark },
  supplierActions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.gutter,
    paddingVertical: 14,
    borderBottomWidth: theme.hairline,
    borderBottomColor: colors.separator,
    backgroundColor: colors.surface,
  },
  orderRight: { alignItems: 'flex-end', gap: 4, maxWidth: '38%' },
  orderMeta: { fontSize: 15, fontWeight: '700', color: colors.text },
  stickyBar: {
    borderTopWidth: theme.hairline,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: theme.gutter,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  stickyTotal: { alignItems: 'stretch', gap: 4 },
  stickyAmount: { fontSize: 22, fontWeight: '800', color: colors.text },
  stickyCta: {
    minHeight: 52,
    borderRadius: theme.radius.md,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyCtaText: { color: colors.onBrand, fontSize: 16, fontWeight: '700' },
  stickySecondary: { alignItems: 'center', paddingVertical: 6 },
  stickySecondaryText: { color: colors.brandDark, fontSize: 14, fontWeight: '600' },
  quickTile: {
    flex: 1,
    minWidth: 72,
    alignItems: 'center',
    gap: 8,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: 4,
    borderRadius: theme.radius.lg,
    borderWidth: theme.hairline,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow.card,
  },
  quickIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.brandLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 12.5, fontWeight: '600', color: colors.text, textAlign: 'center' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.gutter,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  sectionTitle: { ...type.h2 },
  sectionAction: { fontSize: 14, fontWeight: '600', color: colors.brandDark },
  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.45 },
})
