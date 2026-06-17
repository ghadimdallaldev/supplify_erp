#!/usr/bin/env node
/**
 * Regenerate handbook + PDF + PPTX.
 * Usage: node scripts/generate-all-onboarding-docs.mjs
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(label, script) {
  console.log(`\n==> ${label}`)
  const r = spawnSync(process.execPath, [path.join(ROOT, script)], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

run('Assemble handbook', 'docs/onboarding/_assemble-handbook.mjs')
run('Generate PDF', 'scripts/generate-onboarding-pdf.mjs')
run('Generate PowerPoint', 'scripts/generate-onboarding-pptx.mjs')
console.log('\nAll onboarding outputs generated.')
