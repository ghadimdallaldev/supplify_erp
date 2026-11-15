import fs from 'node:fs';
import path from 'node:path';
const root = 'C:/myProjects/supplify_erp/output/mobile-transformation/staged/src';
const edit=(f,fn)=>{const p=path.join(root,f);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));};
for (const [file, screen, content, route] of [
  ['features/restaurant/screens/OrderDetailScreen.tsx','OrderDetailScreen','OrderDetailContent','RestaurantStackParamList'],
  ['features/supplier/screens/SupplierOrderDetailScreen.tsx','SupplierOrderDetailScreen','SupplierOrderDetailContent','SupplierStackParamList'],
]) edit(file, s => {
  const routeLine = `  const { params } = useRoute<RouteProp<${route}, 'OrderDetail'>>()`;
  s = s.replace(`export function ${screen}() {\n${routeLine}`, `export function ${screen}() {\n${routeLine}\n  return <${content} orderId={params.orderId} />\n}\n\nexport function ${content}({ orderId }: { orderId: string }) {`);
  const split = s.indexOf(`export function ${content}`);
  return s.slice(0,split) + s.slice(split).replaceAll('params.orderId','orderId');
});
for (const [file, detailFile, detailName] of [
  ['features/restaurant/screens/OrdersScreen.tsx','./OrderDetailScreen','OrderDetailContent'],
  ['features/supplier/screens/SupplierOrdersScreen.tsx','./SupplierOrderDetailScreen','SupplierOrderDetailContent'],
]) edit(file, s => {
  s = `import { ${detailName} } from '${detailFile}'\nimport { SplitView } from '../../../components/layout/SplitView'\nimport { useAdaptiveLayout } from '../../../theme/responsive'\n` + s;
  s = s.replace("  const [search, setSearch] = useState('')", "  const [search, setSearch] = useState('')\n  const [selectedId, setSelectedId] = useState<string | null>(null)\n  const { wide } = useAdaptiveLayout()");
  s = s.replace('  return (\n    <Screen', '  const master = (\n    <Screen');
  s = s.replace("onPress={() => navigation.navigate('OrderDetail', { orderId: item.id })}", "onPress={() => wide ? setSelectedId(item.id) : navigation.navigate('OrderDetail', { orderId: item.id })}");
  s = s.replace("    </Screen>\n  )\n}", `    </Screen>\n  )\n  return <SplitView master={master} detail={selectedId ? <${detailName} key={selectedId} orderId={selectedId} /> : <EmptyState icon="receipt-outline" title="Orders" message="Choose an order to inspect its details." />} />\n}`);
  s = s.replace("['DELIVERED', 'RECEIVED', 'COMPLETED']", "['DELIVERED', 'RECEIVED', 'RECEIVED_PARTIAL', 'RECEIVED_FULL', 'RECEIVED_WITH_DISPUTE', 'INVOICED', 'COMPLETED']");
  return s;
});
edit('features/supplier/screens/SupplierOrderDetailScreen.tsx', s=>s.replace("import { colors, theme, type }", "import { usePermissions } from '../../../hooks/usePermissions'\nimport { colors, theme, type }")
  .replace('export function SupplierOrderDetailContent({ orderId }: { orderId: string }) {', "export function SupplierOrderDetailContent({ orderId }: { orderId: string }) {\n  const { can, canAny } = usePermissions()")
  .replace('{next ? (', "{next && can('ORDERS_MANAGE') ? (")
  .replace("{['PLACED', 'PENDING_APPROVAL', 'ACKNOWLEDGED', 'PROCESSING'].includes(order.status) ? (", "{canAny('ORDERS_MANAGE', 'FULFILLMENT_MANAGE') && ['PLACED', 'PENDING_APPROVAL', 'ACKNOWLEDGED', 'PROCESSING'].includes(order.status) ? (")
  .replace('    <ScrollView style={styles.container} contentContainerStyle={styles.content}>', '    <ScrollView style={styles.container} contentContainerStyle={[styles.content, { width: \'100%\', maxWidth: 760, alignSelf: \'center\' }]} keyboardShouldPersistTaps="handled">'));
edit('features/chat/screens/ChatThreadScreen.tsx', s=>s.replace("export function ChatThreadScreen() {\n  const { params } = useRoute<RouteProp<ChatStackParamList, 'ChatThread'>>()", "export function ChatThreadScreen() {\n  const { params } = useRoute<RouteProp<ChatStackParamList, 'ChatThread'>>()\n  return <ChatThreadContent conversationId={params.conversationId} title={params.title} />\n}\n\nexport function ChatThreadContent({ conversationId, title }: { conversationId: string; title?: string }) {")
  .replaceAll('params.conversationId','conversationId').replaceAll('params.title','title')
  .replace('<ChatThreadContent conversationId={conversationId} title={title}', '<ChatThreadContent conversationId={params.conversationId} title={params.title}')
  .replace("import { colors, theme, type }", "import { useConversationDraft } from '../useConversationDraft'\nimport { colors, theme, type }")
  .replace("  const [draft, setDraft] = useState('')", "  const [draft, setDraft] = useConversationDraft(conversationId)")
  .replace('  }, [isLoading, latestMessageId, markRead, conversationId])', '  }, [isLoading, latestMessageId, markRead, conversationId])'));
edit('features/chat/screens/ChatListScreen.tsx', s=>`import { SplitView } from '../../../components/layout/SplitView'\nimport { useAdaptiveLayout } from '../../../theme/responsive'\nimport { ChatThreadContent } from './ChatThreadScreen'\n` + s
  .replace("  const [scope, setScope]", "  const { wide } = useAdaptiveLayout()\n  const [selected, setSelected] = useState<{ conversationId: string; title?: string } | null>(null)\n  const [scope, setScope]")
  .replace("      navigation.navigate('ChatThread', { conversationId, title })", "      if (wide) setSelected({ conversationId, title })\n      else navigation.navigate('ChatThread', { conversationId, title })")
  .replace('    [navigation]\n', '    [navigation, wide]\n')
  .replace('  return (\n    <Screen', '  const master = (\n    <Screen')
  .replace('    </Screen>\n  )\n}', '    </Screen>\n  )\n  return <SplitView master={master} detail={selected ? <ChatThreadContent key={selected.conversationId} {...selected} /> : <EmptyState icon="chatbubbles-outline" title="Messages" message="Choose a conversation to read messages." />} />\n}'));
edit('components/ui/index.tsx', s=>s.replace("section: { ...type.overline,", "section: { ...type.h2,").replace("alignItems: 'baseline', paddingRight: theme.gutter", "alignItems: 'center', paddingEnd: theme.gutter, minHeight: 48").replace("maxWidth: 124", "maxWidth: '42%'").replace('numberOfLines={1}>\n                {meta}', '>\n                {meta}'));
console.log('Order and conversation detail layouts staged');
