import fs from 'node:fs';
import path from 'node:path';
const root = 'C:/myProjects/supplify_erp/output/mobile-transformation/staged';
const edit=(f,fn)=>{const p=path.join(root,f);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));};
fs.writeFileSync(path.join(root,'src/components/layout/HomeChrome.tsx'), "export { WorkspaceHeader as HomeChrome, WorkspaceMetrics as MetricStrip } from './WorkspaceHeader'\n");
edit('src/features/restaurant/screens/RestaurantDashboardScreen.tsx', s=>s
  .replace("import { usePermissions }", "import { ASSISTANT_ACCESS_PERMISSIONS, usePermissions }")
  .replace('  ListRow,','  ListRow,\n  IconButton,')
  .replace("    return tiles\n", `    if (can('RESERVATIONS_VIEW')) tiles.push({ key: 'reservations', icon: 'calendar-outline', label: 'Reservations', onPress: () => navigation.navigate('Reservations') })
    if (can('INVENTORY_VIEW') && isEnabled('inventory_management')) tiles.push({ key: 'inventory', icon: 'layers-outline', label: 'Inventory', onPress: () => navigation.navigate('Inventory') })
    return tiles
`)
  .replace('      notificationCount={unread}', "      right={isEnabled('ai_assistant') && canAny(...ASSISTANT_ACCESS_PERMISSIONS) ? <IconButton icon=\"sparkles-outline\" label=\"Ask Supplify\" onPress={() => navigation.navigate('Assistant')} tone=\"brand\" /> : undefined}\n      notificationCount={unread}")
  .replace('        paddingBottom: insets.bottom + theme.spacing.lg,', "        paddingBottom: insets.bottom + theme.spacing.lg,\n        width: '100%', maxWidth: 1120, alignSelf: 'center',")
  .replace('      <MetricStrip>', '      <MetricStrip>')
  .replace('<Metric value={openOrders.length}', '<Metric value={ordersQuery.isError ? \'—\' : openOrders.length}')
  .replace('value={toReceiveCount}', 'value={receivingQuery.isError ? \'—\' : toReceiveCount}')
  .replace('minWidth: 0 },', 'minWidth: 0 },'));
edit('src/services/api/queries/supplier.ts', s=>s.replace('export function useFulfillmentDispatch() {','export function useFulfillmentDispatch(enabled = true) {').replace("api.get<{ orders: DispatchOrderCard[] }>('/api/fulfillment/dispatch'),", "api.get<{ orders: DispatchOrderCard[] }>('/api/fulfillment/dispatch'),\n    enabled,"));
edit('src/features/supplier/screens/SupplierDashboardScreen.tsx', s=>s
  .replace("import { usePermissions }", "import { useEntitlementMap } from '../../../hooks/useEntitlements'\nimport { moneyTotals } from '../../../lib/cartCurrency'\nimport { ASSISTANT_ACCESS_PERMISSIONS, usePermissions }")
  .replace('  ListRow,', '  ListRow,\n  IconButton,')
  .replace('  const { can } = usePermissions()', "  const { can, canAny } = usePermissions()\n  const { isEnabled } = useEntitlementMap()\n  const canDispatch = can('FULFILLMENT_VIEW') && isEnabled('fulfillment_tools')")
  .replace("useOrders({ limit: '50' })", "useOrders({ limit: '50' }, can('ORDERS_VIEW'))")
  .replace('useSupplierDeliveryBoard()', "useSupplierDeliveryBoard('active_delivery', canDispatch)").replace('useFulfillmentDispatch()', 'useFulfillmentDispatch(canDispatch)')
  .replace("  const openValue = openOrders.reduce((sum, order) => sum + (Number(order.total_amount) || 0), 0)\n  const currency = openOrders[0]?.currency ?? allOrders[0]?.currency ?? 'USD'", "  const openValue = moneyTotals(openOrders.map(order => ({ amount: Number(order.total_amount), currency: order.currency }))).map(entry => formatMoney(entry.subtotal, entry.currency)).join(' + ')")
  .replace('      notificationCount={unread}', "      right={isEnabled('ai_assistant') && canAny(...ASSISTANT_ACCESS_PERMISSIONS) ? <IconButton icon=\"sparkles-outline\" label=\"Ask Supplify\" onPress={() => navigation.navigate('Assistant')} tone=\"brand\" /> : undefined}\n      notificationCount={unread}")
  .replace('contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.lg }}', "contentContainerStyle={{ paddingBottom: insets.bottom + theme.spacing.lg, width: '100%', maxWidth: 1120, alignSelf: 'center' }}")
  .replace('<Metric value={openOrders.length} label="Open orders" />', '<Metric value={ordersQuery.isError ? \'—\' : openOrders.length} label="Recent open orders" />')
  .replace('<Metric value={activeDeliveries.length} label="Out for delivery" />', '{canDispatch ? <Metric value={boardQuery.isError ? \'—\' : activeDeliveries.length} label="Out for delivery" /> : null}')
  .replace('<Metric value={formatMoney(openValue, currency)} label="Open value" />', "{openValue ? <Metric value={openValue} label=\"Recent open value\" /> : null}")
  .replace('      {/* The supplier', '      <Text style={{ ...type.caption, paddingHorizontal: theme.gutter }}>Order figures cover your 50 latest orders.</Text>\n\n      {/* The supplier')
  .replace('      <SectionHeader>{t(\'happeningToday\')}</SectionHeader>\n      <Group>', "      {canDispatch ? <>\n      <SectionHeader>{t('happeningToday')}</SectionHeader>\n      <Group>")
  .replace("      {nextOrder ? (", "      </> : null}\n\n      {nextOrder ? (")
  .replace("    borderRadius: theme.radius.sm,", "    borderRadius: theme.radius.md,")
  .replace("    paddingVertical: theme.spacing.md,", "    paddingVertical: theme.spacing.lg,"));
console.log('Role homes staged');
