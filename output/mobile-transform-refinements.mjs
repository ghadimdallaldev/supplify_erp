import fs from 'node:fs';import path from 'node:path';
const root='C:/myProjects/supplify_erp/output/mobile-transformation/staged/src';
const edit=(f,fn)=>{const p=path.join(root,f);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));};
edit('screens/PendingScreen.tsx',s=>s.replace('New accounts stay pending until setup on the web. For local dev use admin@supplify.com / SupplifyAdmin1! — or tap Try again after an admin promotes your account.', 'Your account is waiting for workspace setup. Complete setup on the web or contact your administrator, then refresh.'));
edit('features/assistant/__tests__/AssistantScreen.test.tsx',s=>s.replace('() => ({ isRtl: () => false })','() => ({ ...jest.requireActual("../../../i18n"), isRtl: () => false })'));
edit('components/LegalLinks.tsx',s=>s.replace("import { useAppLocale as useUiLocale }", "import { copy, useAppLocale as useUiLocale }")
 .replace('{link.label}', '{copy(link.label)}').replace("wrap: { gap: theme.spacing.xs, paddingVertical: theme.spacing.sm }", "wrap: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16, paddingVertical: theme.spacing.sm }")
 .replace('row: { paddingVertical: 4 }', "row: { minHeight: 48, justifyContent: 'center' }")
 .replace("color: colors.brand, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline'", "color: colors.textMuted, fontSize: 12, fontWeight: '500'"));
edit('features/shared/FeatureGate.tsx',s=>s.replace('v0: featureName', 'v0: uiCopy(featureName)'));
edit('features/supplier/screens/FulfillmentScreen.tsx',s=>`import { SplitView } from '../../../components/layout/SplitView'\nimport { useAdaptiveLayout } from '../../../theme/responsive'\nimport { usePermissions } from '../../../hooks/usePermissions'\n`+s
 .replace('  const [driverModalVisible,', "  const { wide } = useAdaptiveLayout()\n  const { can } = usePermissions()\n  const canManage = can('FULFILLMENT_MANAGE')\n  const [focusedId, setFocusedId] = useState<string | null>(null)\n  const [driverModalVisible,")
 .replace('    if (!selectedOrder || assignDriver.isPending', '    if (!canManage || !selectedOrder || assignDriver.isPending')
 .replace("  const openDriverPicker = (order: DispatchOrderCard, mode: DriverMode) => {", "  const openDriverPicker = (order: DispatchOrderCard, mode: DriverMode) => {\n    if (!canManage) return")
 .replace('  return (\n    <Screen title=', '  const master = (\n    <Screen title=')
 .replace('        renderItem={({ item }) => (\n          <DispatchCard', '        renderItem={({ item }) => wide ? <ListRow title={item.restaurant_name ?? uiCopy("Order")} subtitle={item.warehouse_name ?? item.delivery_area ?? undefined} right={<StatusPill status={item.delivery_status ?? item.assignment?.status} domain="delivery" />} onPress={() => setFocusedId(item.id)} /> : (\n          <DispatchCard')
 .replace('            busy={busy}', '            busy={busy || !canManage}')
 .replace('<DesignSheet visible={driverModalVisible} onClose={closeDriverPicker}>', '<DesignSheet visible={driverModalVisible} dismissible={!busy} onClose={() => { if (!busy) closeDriverPicker() }}>')
 .replace('    </Screen>\n  )\n}\n\nfunction DispatchCard', `    </Screen>
  )
  const focused = orders.find(order => order.id === focusedId)
  return <SplitView master={master} detail={focused ? <View style={{ padding: 24 }}><DispatchCard order={focused} busy={busy || !canManage} onAssign={() => openDriverPicker(focused, 'assign')} onReassign={() => openDriverPicker(focused, 'reassign')} onRetry={() => openDriverPicker(focused, 'retry')} onRollover={() => { if (canManage) confirmRollover(focused) }} /></View> : <EmptyState icon="car-outline" title={uiCopy("Dispatch")} message={uiCopy("Choose a delivery to review its warehouse, driver, and next action.")} />} />
}

function DispatchCard`));
edit('utils/format.ts',s=>"import { copy, getAppLocale } from '../i18n'\nconst displayLocale = () => getAppLocale() === 'ar' ? 'ar-LB' : 'en-US'\n"+s.replace('Intl.NumberFormat(undefined,', 'Intl.NumberFormat(displayLocale(),').replaceAll('toLocaleDateString(undefined,','toLocaleDateString(displayLocale(),').replaceAll('toLocaleTimeString(undefined,','toLocaleTimeString(displayLocale(),').replace("return 'Today'", "return copy('Today')").replace("return 'Yesterday'", "return copy('Yesterday')"));
edit('app/AppProviders.tsx',s=>s.replace('setAppLocale(user.locale)', 'setAppLocale(user.locale, { persist: false })'));
console.log('Presentation refinements staged');
