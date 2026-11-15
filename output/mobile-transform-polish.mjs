import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);const ts=require('C:/myProjects/supplify_erp/node_modules/typescript');
const root='C:/myProjects/supplify_erp/output/mobile-transformation/staged/src';
const edit=(f,fn)=>{const p=path.join(root,f);fs.writeFileSync(p,fn(fs.readFileSync(p,'utf8')));};
edit('components/ui/index.tsx',s=>s.replace('  padded = true,','  padded = true,\n  form = false,').replace('  padded?: boolean','  padded?: boolean\n  form?: boolean')
  .replace('  const Body = scroll ? ScrollView : View', "  const adaptiveBody = form ? { width: '100%' as const, maxWidth: 640, alignSelf: 'center' as const } : {}\n  const Body = scroll ? ScrollView : View")
  .replace('          contentStyle,\n', '          adaptiveBody,\n          contentStyle,\n')
  .replace('padded && layout.expanded && { paddingHorizontal: layout.gutter }, contentStyle]', 'padded && layout.expanded && { paddingHorizontal: layout.gutter }, adaptiveBody, contentStyle]')
  .replace('        showsVerticalScrollIndicator: false,', "        showsVerticalScrollIndicator: false,\n        keyboardShouldPersistTaps: 'handled' as const,\n        keyboardDismissMode: 'on-drag' as const,")
  .replace('              {title}\n', '              {title}\n')
  .replace("emptyIcon: { width: 64, height: 64, borderRadius: 32", "emptyIcon: { width: 56, height: 56, borderRadius: 14")
  .replace("fontSize: 14.5, lineHeight: 20", "fontSize: 15, lineHeight: 23, maxWidth: 380")
  .replace("rowCompact: { paddingVertical: theme.spacing.sm + 2 }", "rowCompact: { paddingVertical: theme.spacing.sm + 2, minHeight: 56 }")
  .replace("textBtn: { paddingVertical:", "textBtn: { minHeight: 48, justifyContent: 'center', paddingVertical:")
  .replace('<Text style={[styles.btnText, { color: v.fg }]}>{label}</Text>', '<Text style={[styles.btnText, { color: v.fg }]}>{copy(label)}</Text>'));
edit('components/ui/v2.tsx',s=>s.replace('  disabled,\n}: {\n  quantity:', '  disabled,\n  onChangeQuantity,\n}: {\n  quantity:')
  .replace('  onIncrement: () => void\n  disabled?: boolean', '  onIncrement: () => void\n  onChangeQuantity?: (value: number) => void\n  disabled?: boolean')
  .replace('<Text style={styles.qtyValue}>{quantity}</Text>', `<TextInput accessibilityLabel="Quantity" value={String(quantity)} keyboardType="decimal-pad" editable={Boolean(onChangeQuantity) && !disabled} selectTextOnFocus onChangeText={value => { const parsed = Number(value); if (value.trim() && Number.isFinite(parsed) && parsed > 0) onChangeQuantity?.(parsed) }} style={styles.qtyValue} />`)
  .replace("import { Text } from './primitives'", "import { Text, TextInput } from './primitives'")
  .replace('    minWidth: 30,', "    minWidth: 64, maxWidth: 100, minHeight: 48, borderWidth: 0, backgroundColor: 'transparent', paddingHorizontal: 4,")
  .replace('        {label}\n', '        {copy(label)}\n')
  .replace('style={styles.supplierActions}', 'style={styles.supplierActions}')
  .replace("            hitSlop={10}", "            style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}")
  .replace('width: 58,\n    height: 58', 'width: 56,\n    height: 56')
  .replace('backgroundColor: colors.brandLight,\n    alignItems:', 'backgroundColor: colors.backgroundAlt,\n    alignItems:')
  .replace('  stickySecondary: { alignItems:', '  stickySecondary: { minHeight: 48, justifyContent: \'center\', alignItems:'));
edit('features/restaurant/screens/CartScreen.tsx',s=>s.replace('                    quantity={item.quantity}', '                    quantity={item.quantity}\n                    onChangeQuantity={quantity => changeQuantity(item.product.id, quantity)}'));
edit('features/restaurant/screens/reservations/ReservationBoard.tsx',s=>s.replace('<Sheet visible={Boolean(selected)}', '<Sheet scrollable={false} dismissible={!busy} visible={Boolean(selected)}'));
edit('services/api/queries/restaurant.ts',s=>s.replace('useSuppliers(params?: Record<string, string>)', 'useSuppliers(params?: Record<string, string>, enabled = true)').replace('    queryKey: queryKeys.suppliers(params),','    queryKey: queryKeys.suppliers(params),\n    enabled,'));
edit('features/restaurant/screens/RestaurantDashboardScreen.tsx',s=>s.replace('const suppliersQuery = useSuppliers()', "const suppliersQuery = useSuppliers(undefined, can('CATALOG_VIEW'))")
  .replace('    void ordersQuery.refetch()', '    if (canViewOrders) void ordersQuery.refetch()').replace('    void receivingQuery.refetch()', '    if (canReceive) void receivingQuery.refetch()').replace('    void suppliersQuery.refetch()', "    if (can('CATALOG_VIEW')) void suppliersQuery.refetch()"));
edit('features/supplier/screens/SupplierDashboardScreen.tsx',s=>s.replace('    void ordersQuery.refetch()', "    if (can('ORDERS_VIEW')) void ordersQuery.refetch()").replace('    void boardQuery.refetch()', '    if (canDispatch) void boardQuery.refetch()').replace('    void dispatchQuery.refetch()', '    if (canDispatch) void dispatchQuery.refetch()')
  .replace('{stage.label}', '{uiCopy(stage.label)}'));
// Move remaining literal UI configuration into the reactive translation layer.
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const extra=new Set();
for(const file of walk(root).filter(p=>p.endsWith('.tsx')&&!p.includes('__tests__')&&!p.endsWith('primitives.tsx')&&!p.endsWith('motion.tsx'))){
  let source=fs.readFileSync(file,'utf8');const ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const edits=[];let usesCopy=false;let dates=0;let forms=0;
  const hasInputs=(source.match(/<TextInput/g)??[]).length>=2;
  function visit(node){
    if(ts.isJsxOpeningElement(node)&&node.tagName.getText(ast)==='Screen'&&hasInputs&&!node.attributes.properties.some(a=>a.name?.getText(ast)==='form')){edits.push({start:node.tagName.end,end:node.tagName.end,text:' form'});forms++;}
    if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==='TextInput'){
      const attrs=node.attributes.properties;const get=name=>attrs.find(a=>ts.isJsxAttribute(a)&&a.name.getText(ast)===name);
      const placeholder=get('placeholder')?.initializer?.getText(ast)??'';
      const value=get('value');const change=get('onChangeText');
      if(placeholder.includes('YYYY-MM-DD')&&!placeholder.includes('HH')&&value&&change){
        edits.push({start:node.getStart(ast),end:node.end,text:`<DateField ${value.getText(ast)} onChange=${change.initializer.getText(ast)} />`});dates++;return;
      }
    }
    if(ts.isPropertyAssignment(node)&&['label','title','subtitle','text'].includes(node.name.getText(ast).replaceAll("'",''))){
      let ancestor=node.parent;let inFunction=false;let safe=true;
      while(ancestor){if(ts.isCallExpression(ancestor)&&/mutate|api\./.test(ancestor.expression.getText(ast))){safe=false;break;}if(ts.isFunctionLike(ancestor)){inFunction=true;break;}ancestor=ancestor.parent;}
      if(safe&&inFunction){const v=node.initializer;if(ts.isStringLiteral(v)&&/[A-Za-z]{2}/.test(v.text)&&!/^([A-Z_]+|https?:.*)$/.test(v.text)){edits.push({start:v.getStart(ast),end:v.end,text:`uiCopy(${JSON.stringify(v.text)})`});usesCopy=true;extra.add(v.text);}else if(ts.isTemplateExpression(v)){
        let key=v.head.text;const vals=[];v.templateSpans.forEach((span,i)=>{key+=`{{v${i}}}`+span.literal.text;vals.push(`v${i}: ${span.expression.getText(ast)}`)});
        if(/[A-Za-z]{2}/.test(key.replace(/\{\{.*?\}\}/g,''))){edits.push({start:v.getStart(ast),end:v.end,text:`uiCopy(${JSON.stringify(key)}, { ${vals.join(', ')} })`});usesCopy=true;extra.add(key);}
      }}
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
  const unique=[];for(const e of edits.sort((a,b)=>a.start-b.start)){if(!unique.some(x=>e.start<x.end&&e.end>x.start))unique.push(e);}
  unique.sort((a,b)=>b.start-a.start).forEach(e=>source=source.slice(0,e.start)+e.text+source.slice(e.end));
  if(usesCopy&&!source.includes('copy as uiCopy')){let relative=path.relative(path.dirname(file),path.join(root,'i18n')).replaceAll('\\','/');if(!relative.startsWith('.'))relative='./'+relative;source=`import { copy as uiCopy } from '${relative}'\n`+source;}
  if(dates){let relative=path.relative(path.dirname(file),path.join(root,'components/ui/DateField')).replaceAll('\\','/');if(!relative.startsWith('.'))relative='./'+relative;source=`import { DateField } from '${relative}'\n`+source;}
  if(unique.length)fs.writeFileSync(file,source);
}
fs.writeFileSync('C:/myProjects/supplify_erp/output/mobile-transformation/extra-copy.json',JSON.stringify([...extra].sort(),null,2));
console.log(JSON.stringify({additionalCopy:extra.size}));
