import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('C:/myProjects/supplify_erp/node_modules/typescript');
const root = 'C:/myProjects/supplify_erp/output/mobile-transformation/staged/src';
const strings = new Set();
const dry = process.argv.includes('--collect');
function walk(dir) { return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]); }
const candidates = walk(root).filter(p => p.endsWith('.tsx') && !p.includes('__tests__') && !p.endsWith('primitives.tsx') && !p.endsWith('motion.tsx'));
const props = new Set(['label','title','subtitle','message','placeholder','accessibilityLabel','actionLabel','secondaryLabel','totalLabel','emptyTitle','description','helperText','meta','note','stockLabel','headerTitle','primaryLabel','buttonLabel','emptyMessage','caption']);
function modulePath(file, target) { const p = path.relative(path.dirname(file), target).replaceAll('\\','/'); return p.startsWith('.') ? p : './' + p; }
function isCopyContext(node) {
  let current = node;
  while (current.parent) {
    const parent = current.parent;
    if (ts.isCallExpression(parent) && /^(uiCopy|copy|t|assistantText)$/.test(parent.expression.getText())) return false;
    if (ts.isJsxAttribute(parent)) return props.has(parent.name.getText());
    if (ts.isPropertyAssignment(parent)) return false;
    if (ts.isJsxExpression(parent)) {
      const p = parent.parent;
      if (ts.isJsxAttribute(p)) return props.has(p.name.getText());
      if (ts.isJsxElement(p)) return /^(Text|SectionHeader|V2SectionHeader)$/.test(p.openingElement.tagName.getText());
    }
    if (ts.isCallExpression(parent) && parent.expression.getText() === 'Alert.alert') return parent.arguments.indexOf(current) < 2;
    if (ts.isStatement(parent) || ts.isJsxElement(parent)) return false;
    current = parent;
  }
  return false;
}
function meaningful(s) { return /[A-Za-z]{2}/.test(s) && !/^([A-Z_]+|https?:.*|[\w]+[-_][\w-]+)$/.test(s) && s.length > 1; }
let changed = 0;
for (const file of candidates) {
  let source = fs.readFileSync(file, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const primitives = [];
  let usesCopy = false, usesLocale = false;
  function put(start, end, replacement) { if (!edits.some(e => start < e.end && end > e.start)) edits.push({start,end,replacement}); }
  function visit(node) {
    if (ts.isImportDeclaration(node) && node.moduleSpecifier.text === 'react-native' && node.importClause?.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
      const elements = node.importClause.namedBindings.elements;
      const moved = elements.filter(e => ['Text','TextInput'].includes((e.propertyName ?? e.name).text));
      if (moved.length) {
        primitives.push(...moved.map(e => e.getText(ast)));
        const kept = elements.filter(e => !moved.includes(e));
        const defaultName = node.importClause.name?.text;
        const replacement = kept.length || defaultName ? `import ${defaultName ? defaultName + (kept.length ? ', ' : '') : ''}${kept.length ? '{ ' + kept.map(e=>e.getText(ast)).join(', ') + ' }' : ''} from 'react-native'` : '';
        put(node.getStart(ast), node.end, replacement);
      }
    }
    if (ts.isFunctionDeclaration(node) && node.name && /^[A-Z]/.test(node.name.text) && node.body && /<[A-Z]|<View|<>/.test(node.body.getText(ast)) && !node.body.getText(ast).includes('useUiLocale()')) {
      put(node.body.getStart(ast) + 1, node.body.getStart(ast) + 1, '\n  useUiLocale()\n'); usesLocale = true;
    }
    if (ts.isJsxText(node)) {
      const text = node.getText(ast).replace(/\s+/g, ' ').trim();
      if (meaningful(text)) { strings.add(text); put(node.getStart(ast), node.end, `{uiCopy(${JSON.stringify(text)})}`); usesCopy = true; return; }
    }
    if (ts.isStringLiteral(node) && isCopyContext(node) && meaningful(node.text)) {
      strings.add(node.text); usesCopy = true;
      put(node.getStart(ast), node.end, ts.isJsxAttribute(node.parent) ? `{uiCopy(${JSON.stringify(node.text)})}` : `uiCopy(${JSON.stringify(node.text)})`); return;
    }
    if ((ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) && isCopyContext(node)) {
      if (ts.isNoSubstitutionTemplateLiteral(node)) {
        if (meaningful(node.text)) { strings.add(node.text); usesCopy = true; put(node.getStart(ast), node.end, `uiCopy(${JSON.stringify(node.text)})`); } return;
      }
      let text = node.head.text;
      const values = [];
      node.templateSpans.forEach((span, index) => { text += `{{v${index}}}` + span.literal.text; values.push(`v${index}: ${span.expression.getText(ast)}`); });
      if (meaningful(text)) { strings.add(text); usesCopy = true; put(node.getStart(ast), node.end, `uiCopy(${JSON.stringify(text)}, { ${values.join(', ')} })`); return; }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!dry && edits.length) {
    edits.sort((a,b)=>b.start-a.start).forEach(e => { source = source.slice(0,e.start) + e.replacement + source.slice(e.end); });
    const imports = [];
    if (primitives.length) imports.push(`import { ${primitives.join(', ')} } from '${modulePath(file, path.join(root,'components/ui/primitives'))}'`);
    const names = [usesCopy && 'copy as uiCopy', usesLocale && 'useAppLocale as useUiLocale'].filter(Boolean);
    const fresh = names.filter(name => !source.includes(name));
    if (fresh.length) imports.push(`import { ${fresh.join(', ')} } from '${modulePath(file,path.join(root,'i18n'))}'`);
    source = imports.join('\n') + '\n' + source;
    fs.writeFileSync(file, source); changed++;
  }
}
const sorted = [...strings].sort();
fs.writeFileSync('C:/myProjects/supplify_erp/output/mobile-transformation/ui-copy.json', JSON.stringify(sorted,null,2));
const ar = JSON.parse(fs.readFileSync(path.join(root,'i18n/ar.json'),'utf8'));
const missing = sorted.filter(s => !ar[s]);
fs.writeFileSync('C:/myProjects/supplify_erp/output/mobile-transformation/missing-ar.json', JSON.stringify(missing,null,2));
console.log(JSON.stringify({ files: candidates.length, changed, strings: sorted.length, missingArabic: missing.length }));
