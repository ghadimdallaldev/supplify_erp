import fs from 'node:fs';
import path from 'node:path';
const root = 'C:/myProjects/supplify_erp/output/mobile-transformation/staged';
function change(file, fn) { const p = path.join(root, file); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); }
change('src/theme/index.ts', s => s.replace('touchMin: 44', 'touchMin: 48').replace('gutter: 16', 'gutter: 20')
  .replace('radius: { sm: 10, md: 12, lg: 16, xl: 20', 'radius: { sm: 6, md: 10, lg: 14, xl: 22')
  .replace('shadowOpacity: 0.07, shadowRadius: 8', 'shadowOpacity: 0, shadowRadius: 0').replace('android: { elevation: 2 }', 'android: { elevation: 0 }')
  .replace("fontSize: 22, fontWeight: '700' as const", "fontSize: 24, lineHeight: 31, fontWeight: '700' as const")
  .replace("fontSize: 17, fontWeight: '700' as const", "fontSize: 18, lineHeight: 25, fontWeight: '700' as const")
  .replace("fontSize: 16, fontWeight: '600' as const", "fontSize: 15, lineHeight: 22, fontWeight: '600' as const")
  .replace("fontSize: 12.5, fontWeight: '500' as const", "fontSize: 13, lineHeight: 19, fontWeight: '400' as const")
  .replace("fontSize: 24, fontWeight: '700' as const", "fontSize: 26, lineHeight: 34, fontVariant: ['tabular-nums'] as ['tabular-nums'], fontWeight: '700' as const")
  .replace("fontSize: 17, fontWeight: '700' as const", "fontSize: 18, lineHeight: 25, fontVariant: ['tabular-nums'] as ['tabular-nums'], fontWeight: '700' as const"));
change('src/components/ui/index.tsx', s => s.replace("import React from 'react'", "import React from 'react'\nimport { PressFeedback } from './motion'\nimport { useAdaptiveLayout } from '../../theme/responsive'\nimport { isRtl, copy } from '../../i18n'")
  .replace('  const insets = useSafeAreaInsets()', '  const layout = useAdaptiveLayout()\n  const insets = useSafeAreaInsets()')
  .replace('paddingBottom: insets.bottom + theme.spacing.lg', 'paddingBottom: insets.bottom + theme.spacing.lg, ...(layout.expanded ? { paddingHorizontal: layout.gutter } : {})')
  .replace('style: [styles.flex, padded && styles.screenPad, contentStyle]', "style: [styles.flex, padded && styles.screenPad, padded && layout.expanded && { paddingHorizontal: layout.gutter }, contentStyle]")
  .replace('paddingTop: title ? insets.top : 0', 'paddingTop: title && !nativeHeaderVisible ? insets.top : 0')
  .replace('I18nManager.isRTL', 'isRtl()')
  .replace('      accessibilityRole="button"\n      disabled={disabled || loading}', '      accessibilityRole="button"\n      accessibilityLabel={label}\n      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}\n      disabled={disabled || loading}')
  .replace('    <Pressable\n      accessibilityRole="button"\n      accessibilityLabel={label}', '    <PressFeedback\n      accessibilityRole="button"\n      accessibilityLabel={label}')
  .replace('    </Pressable>\n  )\n}\n\nconst BTN_VARIANTS', '    </PressFeedback>\n  )\n}\n\nconst BTN_VARIANTS')
  .replace('        variant === \'primary\' && shadow.brand,', '')
  .replace('        {prettyStatus(safeStatus)}', '        {copy(prettyStatus(safeStatus))}')
  .replace('<Text style={[valueStyle, fg ? { color: fg } : null]} numberOfLines={1} adjustsFontSizeToFit>', '<Text style={[valueStyle, { fontVariant: [\'tabular-nums\'] }, fg ? { color: fg } : null]}>')
  .replace('width: 40,\n    height: 40', 'width: 48,\n    height: 48')
  .replace('    ...shadow.card,', '').replace('borderRadius: theme.radius.pill,\n    borderWidth', 'borderRadius: 6,\n    borderWidth')
  .replace("rowRight: { alignItems: 'flex-end'", "rowRight: { alignItems: 'flex-end'")
  .replace("textTransform: 'uppercase',", "")
  .replace("letterSpacing: 0.5,", "")
  .replace('maxWidth: 150', "maxWidth: '100%'")
  .replace('  return <View style={[styles.group, style]}>{children}</View>', '  return <View style={[styles.group, style]}>{children}</View>'));
change('src/components/ui/v2.tsx', s => s.replace("import { colors, shadow, theme, type }", "import { colors, shadow, theme, type }")
  .replace("type IoniconName =", "import { isRtl, copy } from '../../i18n'\nimport { haptic } from './motion'\n\ntype IoniconName =")
  .replaceAll('I18nManager.isRTL', 'isRtl()').replace('{prettyStatus(safe)}', '{copy(prettyStatus(safe))}')
  .replace('onPress={onDecrement}', "onPress={() => { haptic(); onDecrement() }}").replace('onPress={onIncrement}', "onPress={() => { haptic(); onIncrement() }}")
  .replace("borderRadius: theme.radius.pill", 'borderRadius: 6').replace('    ...shadow.card,', '')
  .replace("    flex: 1,\n    minWidth: 72,", "    width: '31%',\n    minWidth: 96,")
  .replace("    borderWidth: theme.hairline,\n    borderColor: colors.border,\n    backgroundColor: colors.surface,\n  },\n  quickIcon:", "    backgroundColor: colors.surface,\n  },\n  quickIcon:")
  .replace('    borderRadius: 22,', '    borderRadius: 10,')
  .replace("  orderMeta: { fontSize: 15, fontWeight: '700', color: colors.text }", "  orderMeta: { fontSize: 15, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] }")
  .replace('<Text style={styles.orderMeta} numberOfLines={1}>', '<Text style={styles.orderMeta}>')
  .replace("  pressed: { opacity: 0.85, transform: [{ scale: 0.985 }] }", "  pressed: { opacity: 0.8 }"));
change('app.json', s => { const j = JSON.parse(s); j.expo.orientation = 'default'; j.expo.ios.supportsTablet = true; return JSON.stringify(j, null, 2) + '\n'; });
change('App.tsx', s => "import { GestureHandlerRootView } from 'react-native-gesture-handler'\n" + s.replace('return <AppProviders />', "return <GestureHandlerRootView style={{ flex: 1 }}><AppProviders /></GestureHandlerRootView>"));
console.log('Foundation staged');
