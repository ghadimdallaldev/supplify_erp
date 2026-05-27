#!/usr/bin/env node
/**
 * Promote dev → preprod or prod: merge, prune dev-only files, commit.
 * Run from repo root on a clean dev branch:
 *   node scripts/promote-release.mjs --tier preprod|prod
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`)
  execSync(cmd, { cwd: ROOT, stdio: 'inherit', ...opts })
}

function runCapture(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function hasUnmergedPaths(porcelain) {
  return porcelain.split('\n').some((line) => {
    if (!line.trim()) return false
    return line.slice(0, 2).includes('U')
  })
}

const tier = (() => {
  const i = process.argv.indexOf('--tier')
  if (i === -1 || !process.argv[i + 1]) {
    console.error('Usage: node scripts/promote-release.mjs --tier preprod|prod')
    process.exit(1)
  }
  const t = process.argv[i + 1]
  if (t !== 'preprod' && t !== 'prod') {
    console.error('--tier must be preprod or prod')
    process.exit(1)
  }
  return t
})()

const branch = tier
// Always promote from dev so release branches get the full runtime tree (not a stale preprod snapshot).
const source = 'dev'

const dirty = runCapture('git status --porcelain')
if (dirty) {
  console.error('Working tree is not clean. Commit or stash changes before promoting.')
  process.exit(1)
}

const current = runCapture('git branch --show-current')
if (current !== 'dev') {
  console.error(`Run from the dev branch (current: ${current})`)
  process.exit(1)
}

console.log(`\nPromoting ${source} → ${branch} (EC2 ${tier} deploy branch)\n`)

run('git fetch origin')
run(`git checkout ${branch}`)
// Prefer dev on conflicts — release branches must not keep outdated prod/preprod copies.
try {
  run(`git merge origin/${source} -m "merge(${source}): promote to ${branch}" -X theirs`)
} catch {
  // Release branches delete promote/prune scripts; dev keeps updating them.
  run('git rm -f scripts/promote-release.mjs scripts/prune-release-tree.mjs')
  let stillDirty = runCapture('git status --porcelain')
  if (hasUnmergedPaths(stillDirty) && fs.existsSync(path.join(ROOT, 'docs'))) {
    // Release branches must not contain docs/ (pruned tree).
    run('git rm -rf docs')
    stillDirty = runCapture('git status --porcelain')
  }
  if (hasUnmergedPaths(stillDirty)) {
    console.error('Merge has unresolved conflicts. Resolve manually, then re-run promote.')
    process.exit(1)
  }
  run('git commit --no-edit')
}

// Sync all application source and DB migrations from dev before prune.
run('git checkout origin/dev -- apps/')
run('git checkout origin/dev -- apps/api/db/migrations')

// Prune script is dev-only; restore from dev before running on the release branch.
const pruneSrc = runCapture('git show origin/dev:scripts/prune-release-tree.mjs')
fs.writeFileSync(path.join(ROOT, 'scripts/prune-release-tree.mjs'), pruneSrc)
run(`node scripts/prune-release-tree.mjs --tier ${tier}`)

run('git add -A')
const after = runCapture('git status --porcelain')
if (!after) {
  console.log('\nNothing to commit after prune — branch already up to date.\n')
} else {
  run(`git commit -m "chore(release): prune ${branch} tree for EC2 deploy"`)
}

run(`git push origin ${branch}`)
run('git checkout dev')

console.log(`\n✓ ${branch} promoted and pushed. Deploy with CDK or deploy/scripts on the target host.\n`)
