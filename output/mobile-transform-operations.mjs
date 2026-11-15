import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('C:/myProjects/supplify_erp/node_modules/typescript');
const root = 'C:/myProjects/supplify_erp/output/mobile-transformation/staged/src';
const edit=(f,fn)=>{const p=path.join(root,f);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));};
fs.writeFileSync(path.join(root,'features/restaurant/screens/reservations/ReservationsScreen.tsx'),"export { ReservationBoard as ReservationsScreen } from './ReservationBoard'\n");
edit('services/api/queries/reservations.ts',s=>s.replace('useReservationBoard(date?: string)', 'useReservationBoard(date?: string, enabled = true)').replace("    queryKey: queryKeys.reservationBoard(date),", "    queryKey: queryKeys.reservationBoard(date),\n    enabled,"));
edit('features/restaurant/screens/reservations/ReservationBoard.tsx',s=>s.replace('DateField, localDateKey','DateField, localDateKey, parseDateKey').replace("useReservationBoard(day, can('RESERVATIONS_VIEW'))", "useReservationBoard(day, can('RESERVATIONS_VIEW') && Boolean(parseDateKey(day)))"));
edit('features/restaurant/screens/reservations/CreateReservationScreen.tsx',s=>"import { DateField } from '../../../../components/ui/DateField'\n" + s.replace('      <SectionHeader>Guest</SectionHeader>', '      <SectionHeader>Guest</SectionHeader>')
  .replace("    const size = Number(partySize)", "    const size = Number(partySize)")
  .replace('!Number.isFinite(size) || size < 1', '!Number.isInteger(size) || size < 1')
  .replace('!Number.isFinite(duration) || duration < 30', '!Number.isInteger(duration) || duration < 30'));
edit('features/supplier/screens/FulfillmentScreen.tsx',s=>s.replace('Button, Card, EmptyState, FlashList', 'Button, Card, EmptyState, ErrorState, FlashList')
  .replace('  const { data, isLoading, refetch } = useFulfillmentDispatch()', '  const { data, isLoading, isError, refetch } = useFulfillmentDispatch()')
  .replace('  if (isLoading) return <LoadingState />', '  if (isLoading) return <LoadingState />\n  if (isError) return <Screen title="Dispatch"><ErrorState message="Could not load deliveries." onRetry={() => void refetch()} /></Screen>')
  .replace('rollover.isPending\n', 'rollover.isPending || retryDelivery.isPending\n')
  .replace("  const pickDriver = (driverId: string) => {\n    if (!selectedOrder) return", "  const pickDriver = (driverId: string) => {\n    if (!selectedOrder || assignDriver.isPending || reassignDriver.isPending || retryDelivery.isPending) return"));
edit('features/shared/BranchPickerSheet.tsx',s=>s.replace('onRequestClose={onClose}', 'onRequestClose={saving ? () => {} : onClose}'));
edit('features/settings/MoreGroupScreen.tsx',s=>"import { copy } from '../../i18n'\n" + s.replace('title={item.title}', 'title={copy(item.title)}'));
edit('screens/AdminHomeScreen.tsx',s=>"import { copy } from '../i18n'\n" + s.replaceAll('title={title}', 'title={copy(title)}'));
edit('features/shared/ToastProvider.tsx',s=>s.replace('useContext, useState','useContext, useState, useEffect, useRef').replace("import { ToastBanner }", "import { haptic } from '../../components/ui/motion'\nimport { ToastBanner }")
  .replace('  const [toasts, setToasts] = useState<Toast[]>([])', "  const [toasts, setToasts] = useState<Toast[]>([])\n  const timers = useRef<ReturnType<typeof setTimeout>[]>([])\n  const nextId = useRef(0)\n  useEffect(() => () => timers.current.forEach(clearTimeout), [])")
  .replace('    const id = Date.now()', "    const id = ++nextId.current\n    if (tone === 'success' || tone === 'error') haptic(tone)")
  .replace('    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)', "    timers.current.push(setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500))"));
edit('components/ui/primitives.tsx',s=>s.replace('const fontFamily =', 'export type Text = NativeText\nexport type TextInput = NativeInput\n\nconst fontFamily =').replace('<NativeInput ref={ref} {...props}', '<NativeInput ref={ref} {...props} accessibilityLabel={props.accessibilityLabel ?? props.placeholder}'));
// Migrate transparent custom sheet modals without changing their business handlers.
function walk(dir) { return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]); }
const migrated=[];
for (const file of walk(root).filter(p=>p.endsWith('.tsx')&&!p.includes('__tests__')&&!p.includes('components/ui/'))) {
  let source=fs.readFileSync(file,'utf8');
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const edits=[];
  function visit(node) {
    if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='Modal') {
      const attributes=node.openingElement.attributes.properties;
      const attribute=name=>attributes.find(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)===name);
      const transparent=attribute('transparent'),visible=attribute('visible'),close=attribute('onRequestClose');
      const children=node.children.filter(n=>!ts.isJsxText(n)||n.getText(ast).trim());
      const panel=children.find(n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(ast)==='View');
      const backdrop=children.find(n=>ts.isJsxSelfClosingElement(n)&&n.tagName.getText(ast)==='Pressable');
      if(transparent&&visible?.initializer&&close?.initializer&&panel&&backdrop&&children.length===2) {
        const body=source.slice(panel.openingElement.end,panel.closingElement.getStart(ast));
        edits.push({start:node.getStart(ast),end:node.end,replacement:`<DesignSheet ${visible.getText(ast)} onClose=${close.initializer.getText(ast)}>${body}</DesignSheet>`}); return;
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
  if(edits.length) {
    edits.sort((a,b)=>b.start-a.start).forEach(e=>source=source.slice(0,e.start)+e.replacement+source.slice(e.end));
    let relative=path.relative(path.dirname(file),path.join(root,'components/ui/Sheet')).replaceAll('\\','/');if(!relative.startsWith('.'))relative='./'+relative;
    fs.writeFileSync(file,`import { Sheet as DesignSheet } from '${relative}'\n`+source);
    migrated.push({file:path.relative(root,file),sheets:edits.length});
  }
}
fs.writeFileSync('C:/myProjects/supplify_erp/output/mobile-transformation/sheet-migration.json',JSON.stringify(migrated,null,2));
console.log(JSON.stringify({migratedSheets:migrated.reduce((n,x)=>n+x.sheets,0),files:migrated.length}));
