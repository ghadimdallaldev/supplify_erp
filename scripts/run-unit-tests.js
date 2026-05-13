#!/usr/bin/env node
/**
 * Run unit tests across workspaces that define jest.config.js.
 * Generates Prisma clients first, then runs jest per package.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createRequire } = require('module');

const root = path.resolve(__dirname, '..');

const prismaSchemas = [
  'services/inventory/prisma/schema.prisma',
  'services/orders/prisma/schema.prisma',
  'services/restaurants/prisma/schema.prisma',
];

function generatePrismaClient(serviceDir) {
  const requireFromService = createRequire(path.join(serviceDir, 'package.json'));
  const prismaCli = requireFromService.resolve('prisma/build/index.js');
  execSync(`node "${prismaCli}" generate`, {
    cwd: serviceDir,
    stdio: 'inherit',
    shell: true,
  });
}

function maybeGeneratePrismaForPackage(pkgDir) {
  const rel = path.relative(root, pkgDir).replace(/\\/g, '/');
  const schemaEntry = prismaSchemas.find((schema) => rel === path.dirname(path.dirname(schema)).replace(/\\/g, '/'));
  if (schemaEntry) {
    const serviceDir = path.dirname(path.dirname(path.join(root, schemaEntry)));
    console.log(`Generating Prisma client for ${rel}...`);
    generatePrismaClient(serviceDir);
  }
}

function findJestPackages(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === '.git') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    const jestConfig = path.join(fullPath, 'jest.config.js');
    const packageJson = path.join(fullPath, 'package.json');

    if (fs.existsSync(jestConfig) && fs.existsSync(packageJson)) {
      results.push(fullPath);
      continue;
    }

    if (['apps', 'services', 'packages'].includes(entry.name)) {
      findJestPackages(fullPath, results);
    }
  }
  return results;
}

const packages = findJestPackages(root).sort();
console.log(`Running unit tests in ${packages.length} packages...`);

let failed = false;
for (const pkgDir of packages) {
  const rel = path.relative(root, pkgDir);
  console.log(`\n=== ${rel} ===`);
  try {
    maybeGeneratePrismaForPackage(pkgDir);
    execSync('npx jest --config jest.config.js --forceExit', {
      cwd: pkgDir,
      stdio: 'inherit',
      shell: true,
    });
  } catch {
    failed = true;
  }
}

if (failed) {
  process.exit(1);
}
