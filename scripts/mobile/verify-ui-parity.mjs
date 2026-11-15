import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';

const roots = ['C:/myProjects/supplify-mobile', 'C:/myProjects/supplify-mobile-ios'];
const walk = (dir, prefix = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? walk(path.join(dir, entry.name), prefix + entry.name + '/') : [prefix + entry.name]);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const files = walk(path.join(roots[0], 'src'));
const other = new Set(walk(path.join(roots[1], 'src')));
const errors = [];
const packages = roots.map(root => JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')));
for (const key of ['dependencies', 'devDependencies', 'packageManager']) {
  if (JSON.stringify(packages[0][key]) !== JSON.stringify(packages[1][key])) errors.push('Package configuration differs: ' + key);
}
for (const root of roots) {
  if (fs.existsSync(path.join(root, 'package-lock.json'))) errors.push('Obsolete npm lockfile: ' + root);
  const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));
  for (const [profile, config] of Object.entries(eas.build)) {
    if (config.pnpm && 'pnpm@' + config.pnpm !== packages[0].packageManager) errors.push('EAS pnpm version differs: ' + profile);
  }
}
for (const file of files) {
  if (!other.delete(file) || hash(fs.readFileSync(path.join(roots[0], 'src', file))) !== hash(fs.readFileSync(path.join(roots[1], 'src', file)))) errors.push('Source differs: ' + file);
}
for (const file of other) errors.push('iOS-only source: ' + file);
for (const file of ['App.tsx', 'app.json', 'jest.setup.js', 'pnpm-lock.yaml']) {
  if (hash(fs.readFileSync(path.join(roots[0], file))) !== hash(fs.readFileSync(path.join(roots[1], file)))) errors.push('Configuration differs: ' + file);
}
const en = JSON.parse(fs.readFileSync(path.join(roots[0], 'src/i18n/en.json'), 'utf8'));
const ar = JSON.parse(fs.readFileSync(path.join(roots[0], 'src/i18n/ar.json'), 'utf8'));
for (const key of Object.keys(en)) if (typeof ar[key] !== 'string' || !ar[key].trim()) errors.push('Missing Arabic copy: ' + key);
const declared = { ...packages[0].dependencies, ...packages[0].devDependencies };
const directImports = new Set();
for (const file of [...files.filter(file => /\.tsx?$/.test(file)), '../App.tsx', '../index.ts']) {
  const source = fs.readFileSync(path.join(roots[0], 'src', file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function checkImport(value) {
    if (value.startsWith('.')) return;
    const name = value.startsWith('@') ? value.split('/').slice(0, 2).join('/') : value.split('/')[0];
    directImports.add(name);
    if (!declared[name]) errors.push('Undeclared import: ' + name + ' in ' + file);
  }
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) checkImport(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.arguments.length && ts.isStringLiteralLike(node.arguments[0]) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) checkImport(node.arguments[0].text);
    if (ts.isCallExpression(node) && /^(uiCopy|copy)$/.test(node.expression.getText(ast)) && node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0])) {
      const parent = node.parent;
      if (ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind)) errors.push('Translated internal comparison: ' + file);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
console.log(JSON.stringify({ sourceFiles: files.length, registeredCopy: Object.keys(en).length, directImports: directImports.size, errors }, null, 2));
if (errors.length) process.exitCode = 1;
