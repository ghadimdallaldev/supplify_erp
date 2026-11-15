import fs from 'node:fs';
import path from 'node:path';
const root = 'C:/myProjects/supplify_erp/output/mobile-transformation/staged';
const edit = (f, fn) => { const p = path.join(root,f); fs.writeFileSync(p, fn(fs.readFileSync(p,'utf8'))); };
fs.writeFileSync(path.join(root,'src/screens/LoginScreen.tsx'), "export { SignInExperience as LoginScreen } from './SignInExperience'\n");
fs.writeFileSync(path.join(root,'src/components/ui/Sheet.tsx'), "export { SheetSurface as Sheet } from './SheetSurface'\n");
edit('src/navigation/navStyle.tsx', s => s.replace("import React from 'react'", "import React from 'react'\nimport { useAdaptiveLayout } from '../theme/responsive'\nimport { useAppLocale, copy, isRtl } from '../i18n'")
  .replace('export function tabScreenOptions(', 'export function useTabScreenOptions(')
  .replace("  return ({ route }) => ({", "  const { wide } = useAdaptiveLayout()\n  useAppLocale()\n  return ({ route }) => ({\n    tabBarPosition: wide ? (isRtl() ? 'right' : 'left') : 'bottom',\n    tabBarLabelPosition: wide ? 'beside-icon' : 'below-icon',\n    tabBarLabel: copy(({ Shop: 'Suppliers', Chat: 'Messages', Dashboard: 'Home', Fulfillment: 'Dispatch', Deliveries: 'Today' } as Record<string, string>)[route.name] ?? route.name),")
  .replace("      ...shadow.sheet,", "      ...(wide ? { width: 172, paddingTop: 24, borderEndWidth: 1, borderEndColor: colors.border } : {}),")
  .replace("tabBarItemStyle: { paddingTop: 2 }", "tabBarItemStyle: { paddingTop: 2, minHeight: 54, ...(wide ? { marginHorizontal: 8, marginVertical: 4, borderRadius: 10 } : {}) }")
  .replace("fontSize: 11.5", "fontSize: 12")
  .replace("  headerBackVisible: true,", "  headerBackVisible: true,\n  animation: 'default',\n  fullScreenGestureEnabled: true,"));
for (const file of fs.readdirSync(path.join(root,'src/navigation')).filter(f=>f.endsWith('Navigator.tsx'))) edit('src/navigation/'+file, s=>s.replaceAll('tabScreenOptions','useTabScreenOptions'));
edit('src/navigation/RestaurantNavigator.tsx', s => s.replace("    'INVENTORY_VIEW'\n  )", "    'INVENTORY_VIEW',\n    'RESERVATIONS_VIEW'\n  )")
  .replace("  const initialRoute = isHostOnly\n    ? 'Host'\n    : showHome", "  const initialRoute = showHome")
  .replace(/\n      \{isHostOnly && can\('RESERVATIONS_VIEW'\) \? \([\s\S]*?\n      \) : null\}/, '')
  .replace("      {can('ORDERS_VIEW') ? <Tab.Screen name=\"Orders\" component={OrdersScreen} /> : null}\n\n", '')
  .replace("      {can('CHAT_VIEW') ? (", "      {can('ORDERS_VIEW') ? <Tab.Screen name=\"Orders\" component={OrdersScreen} /> : null}\n\n      {can('CHAT_VIEW') ? ("));
edit('src/components/ui/FilterBar.tsx', s => s.replace("import { colors, theme }", "import { haptic } from './motion'\nimport { copy } from '../../i18n'\nimport { colors, theme }")
  .replace('onPress={() => onChange(opt.key)}', 'onPress={() => { haptic(); onChange(opt.key) }}')
  .replace('{opt.label}', '{copy(opt.label)}').replace('minHeight: 34','minHeight: 48').replace('borderRadius: theme.radius.pill','borderRadius: 8')
  .replace("chipActive: { borderColor: colors.brand, backgroundColor: colors.brand }", "chipActive: { borderColor: colors.brandBorder, backgroundColor: colors.brandLight }")
  .replace('chipTextActive: { color: colors.onBrand }','chipTextActive: { color: colors.brandDark }'));
edit('src/components/ui/SearchField.tsx', s => s.replace("import { colors, theme }", "import { isRtl } from '../../i18n'\nimport { colors, theme }")
  .replace('I18nManager.isRTL','isRtl()').replace('          value={value}', '          accessibilityLabel={placeholder}\n          value={value}')
  .replace('            hitSlop={8}', "            style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}")
  .replace("    paddingVertical: 0,", "    paddingVertical: 0,\n    paddingHorizontal: 0,\n    borderWidth: 0,\n    backgroundColor: 'transparent',"));
edit('src/features/settings/SettingsScreen.tsx', s=>s.replace("import { useState }", "import { useState }")
  .replace("import { destPreview", "import { SearchField } from '../../components/ui/SearchField'\nimport { copy, getAppLocale, setAppLocale } from '../../i18n'\nimport { destPreview")
  .replace('  const [branchOpen, setBranchOpen] = useState(false)', "  const [branchOpen, setBranchOpen] = useState(false)\n  const [search, setSearch] = useState('')")
  .replace('      {showWorkspaceSwitcher ? (', `      <SearchField value={search} onChangeText={setSearch} placeholder="Search tools and settings" />
      {search.trim() ? <Group>{[...today, ...tools.flatMap(group => group.items)].filter(item => copy(item.title).toLowerCase().includes(search.trim().toLowerCase())).map(item => <ListRow key={item.screen ?? item.webPath ?? item.tab} title={copy(item.title)} icon={item.icon} onPress={() => openDest(item)} />)}</Group> : null}
      <ListRow title="Language" subtitle={getAppLocale() === 'ar' ? 'العربية' : 'English'} icon="language-outline" onPress={() => setAppLocale(getAppLocale() === 'ar' ? 'en' : 'ar')} />
      {!search.trim() && showWorkspaceSwitcher ? (`)
  .replace('{today.length > 0 ? (', '{!search.trim() && today.length > 0 ? (').replace('{tools.length > 0 ? (', '{!search.trim() && tools.length > 0 ? (')
  .replace('title={item.title}', 'title={copy(item.title)}').replace('title={group.title}', 'title={copy(group.title)}'));
edit('src/app/AppProviders.tsx', s=>s.replace("import { NavigationContainer }", "import { DefaultTheme, NavigationContainer }")
  .replace("import { RootNavigator }", "import { colors } from '../theme'\nimport { RootNavigator }")
  .replace('              ref={navigationRef}', '              theme={{ ...DefaultTheme, colors: { ...DefaultTheme.colors, primary: colors.brand, background: colors.background, card: colors.surface, text: colors.text, border: colors.border, notification: colors.danger } }}\n              ref={navigationRef}'));
edit('App.tsx', s=>s.replace("import { AppProviders }", "import { useAppLocale } from './src/i18n'\nimport { AppProviders }").replace('export default function App() {', 'export default function App() {\n  const locale = useAppLocale()').replace('style={{ flex: 1 }}', "style={{ flex: 1, direction: locale === 'ar' ? 'rtl' : 'ltr' }}"));
console.log('Navigation, sign-in, sheets and account directory staged');
