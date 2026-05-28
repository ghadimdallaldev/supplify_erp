#!/usr/bin/env node
/**
 * Promote release branches: dev → preprod, then preprod → prod (never dev → prod).
 * Run from repo root on a clean dev branch:
 *   node scripts/promote-release.mjs --tier preprod
 *   node scripts/promote-release.mjs --tier prod   # after UAT on preprod
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
// preprod ← dev (full tree + prune). prod ← preprod only (UAT-signed runtime; never merge dev directly into prod).
const source = tier === 'prod' ? 'preprod' : 'dev'

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

if (tier === 'prod') {
  console.log('\n⚠ prod promotes from preprod only (pruned UAT tree). Run preprod promote first.\n')
}
console.log(`\nPromoting ${source} → ${branch} (EC2 ${tier} deploy branch)\n`)

run('git fetch origin')
run(`git checkout ${branch}`)
// Prefer dev on conflicts — release branches must not keep outdated prod/preprod copies.
try {
  run(`git merge origin/${source} -m "merge(${source}): promote to ${branch}" -X theirs`)
} catch {
  // Release branches delete promote/prune scripts; dev keeps updating them.
  for (const rel of ['scripts/promote-release.mjs', 'scripts/prune-release-tree.mjs']) {
    if (fs.existsSync(path.join(ROOT, rel))) run(`git rm -f ${rel}`)
  }
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

// Sync runtime tree from source branch before prune (preprod←dev, prod←preprod).
const syncRef = tier === 'prod' ? 'origin/preprod' : 'origin/dev'
run(`git checkout ${syncRef} -- apps/`)
run(`git checkout ${syncRef} -- apps/api/db/migrations`)

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
