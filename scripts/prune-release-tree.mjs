#!/usr/bin/env node
/**
 * Remove development-only files from the working tree for preprod/prod branches.
 * Run from repo root after merging dev:
 *   node scripts/prune-release-tree.mjs --tier preprod|prod
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const tier = (() => {
  const i = process.argv.indexOf('--tier')
  if (i === -1 || !process.argv[i + 1]) {
    console.error('Usage: node scripts/prune-release-tree.mjs --tier preprod|prod')
    process.exit(1)
  }
  const t = process.argv[i + 1]
  if (t !== 'preprod' && t !== 'prod') {
    console.error('--tier must be preprod or prod')
    process.exit(1)
  }
  return t
})()

function rm(target) {
  const abs = path.join(ROOT, target)
  if (!fs.existsSync(abs)) return
  fs.rmSync(abs, { recursive: true, force: true })
  console.log(`removed ${target}`)
}

function rmFile(target) {
  const abs = path.join(ROOT, target)
  if (!fs.existsSync(abs)) return
  fs.unlinkSync(abs)
  console.log(`removed ${target}`)
}

function walk(dir, onFile) {
  if (!fs.existsSync(dir)) return
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name)
    if (ent.isDirectory()) walk(abs, onFile)
    else onFile(abs)
  }
}

function removeTestFiles() {
  walk(path.join(ROOT, 'apps/api/src'), (file) => {
    if (file.endsWith('.test.js')) rmFile(path.relative(ROOT, file))
  })
  walk(path.join(ROOT, 'apps/web/src'), (file) => {
    if (/\.test\.(ts|tsx|jsx)$/.test(file)) rmFile(path.relative(ROOT, file))
  })
}

function pruneApiScripts() {
  const dir = path.join(ROOT, 'apps/api/scripts')
  if (!fs.existsSync(dir)) return
  for (const name of fs.readdirSync(dir)) {
    const keep = new Set([
      'migrate.js',
      'run-migration.js',
      'migrate-users-to-roles.js',
      'migrate-suppliers-to-orgs.js',
      'sync-system-roles.mjs',
      'lib',
    ])
    if (!keep.has(name)) {
      rm(path.join('apps/api/scripts', name))
    }
  }
}

function patchServerJs() {
  const rel = 'apps/api/src/server.js'
  const abs = path.join(ROOT, rel)
  if (!fs.existsSync(abs)) return
  let src = fs.readFileSync(abs, 'utf8')
  src = src.replace(/import \{ e2eRoutes \} from '\.\/routes\/e2e\.routes\.js'\r?\n/, '')
  src = src.replace(
    /\r?\nif \(config\.E2E_SECRET\) \{\r?\n\s*app\.use\('\/api\/e2e', e2eRoutes\)\r?\n\}\r?\n/,
    '\n'
  )
  fs.writeFileSync(abs, src)
  console.log('patched apps/api/src/server.js (removed e2e routes)')
}

function pruneDeployArtifacts() {
  rm('docker-compose.yml')
  rm('docker')
}

function writeJson(rel, data) {
  fs.writeFileSync(path.join(ROOT, rel), `${JSON.stringify(data, null, 2)}\n`)
  console.log(`wrote ${rel}`)
}

function slimPackageJson() {
  const rootPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  const rootSlim = {
    name: 'supplify',
    version: '1.0.0',
    description: 'Supplify - Restaurant & F&B Supplier Marketplace',
    private: true,
    type: 'module',
    scripts: {
      build: 'pnpm --filter @supplify/api build && pnpm --filter @supplify/web build',
      'db:migrate': 'node apps/api/scripts/migrate.js',
      'db:sync-roles': 'node apps/api/scripts/sync-system-roles.mjs',
      setup: 'node scripts/ensure-pnpm.mjs && node scripts/pnpm-run.mjs install',
    },
    engines: { node: '>=18.0.0', pnpm: '>=8.0.0' },
    packageManager: 'pnpm@8.15.9',
  }
  // pnpm-lock.yaml embeds overrides — omitting them breaks frozen install in Docker.
  if (rootPkg.pnpm) rootSlim.pnpm = rootPkg.pnpm
  writeJson('package.json', rootSlim)

  writeJson('apps/api/package.json', {
    name: '@supplify/api',
    version: '2.0.0',
    description: 'Supplify API Server',
    type: 'module',
    main: 'dist/server.js',
    scripts: {
      build: "echo 'Build not needed for JS'",
      start: 'node src/server.js',
      'db:migrate': 'node scripts/migrate.js',
    },
    dependencies: JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/api/package.json'), 'utf8'))
      .dependencies,
  })

  const webPkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/web/package.json'), 'utf8'))
  const dockerBuild = webPkg.scripts['build:docker'] || webPkg.scripts.build
  writeJson('apps/web/package.json', {
    name: '@supplify/web',
    version: '2.0.0',
    description: 'Supplify Web Application',
    type: 'module',
    scripts: {
      build: dockerBuild,
      'build:docker': dockerBuild,
      preview: 'vite preview',
    },
    dependencies: webPkg.dependencies,
    devDependencies: {
      '@types/react': webPkg.devDependencies['@types/react'],
      '@types/react-dom': webPkg.devDependencies['@types/react-dom'],
      '@vitejs/plugin-react': webPkg.devDependencies['@vitejs/plugin-react'],
      autoprefixer: webPkg.devDependencies.autoprefixer,
      postcss: webPkg.devDependencies.postcss,
      tailwindcss: webPkg.devDependencies.tailwindcss,
      typescript: webPkg.devDependencies.typescript,
      vite: webPkg.devDependencies.vite,
    },
  })
}

function writeReadme() {
  const envLabel = tier === 'preprod' ? 'Pre-production' : 'Production'
  fs.writeFileSync(
    path.join(ROOT, 'README.md'),
    `# Supplify (${envLabel} branch)

Deploy-only branch — **do not develop here**. On \`dev\`: \`node scripts/promote-release.mjs --tier preprod\`, then after UAT \`--tier prod\` (prod merges **preprod**, not dev).

\`\`\`bash
node scripts/promote-release.mjs --tier ${tier}
\`\`\`

## Deploy (Railway)

Push to this branch triggers Railway deploy for the matching environment. See \`docs/operations/railway-environments.md\` on the \`dev\` branch.
`
  )
  console.log('wrote README.md')
}

// ── Shared removals ───────────────────────────────────────────────────────────
const SHARED_DIRS = [
  'docs',
  'tests',
  '.github',
  '.claude',
  '.cursor',
  '.husky',
  'apps/web/src/test',
  'apps/api/db/seed',
  'agent-transcripts',
]

const SHARED_FILES = [
  'apps/api/src/routes/e2e.routes.js',
  'apps/api/vitest.config.js',
  'apps/web/vitest.config.ts',
  'commitlint.config.js',
  '.lintstagedrc.js',
  'releaserc.json',
  '.releaserc',
  '.releaserc.js',
  'AGENTS.md',
  '.cursorrules',
  'scripts/dev-native.mjs',
  'scripts/dev-apps.mjs',
  'scripts/dev-infra.mjs',
  'scripts/run-local.mjs',
  'scripts/run-local.sh',
  'scripts/run-local.ps1',
  'scripts/run-local.cmd',
  'scripts/ensure-native-env.mjs',
  'scripts/prune-release-tree.mjs',
  'scripts/promote-release.mjs',
]

console.log(`\nPruning release tree (tier=${tier})...\n`)

for (const d of SHARED_DIRS) rm(d)
for (const f of SHARED_FILES) rmFile(f)

removeTestFiles()
pruneApiScripts()
patchServerJs()
pruneDeployArtifacts()
slimPackageJson()
writeReadme()

console.log('\nDone. Review with `git status`, then commit.\n')
