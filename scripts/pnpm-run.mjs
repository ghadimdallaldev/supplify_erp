#!/usr/bin/env node
import { getRepoRoot } from './lib/docker-env.mjs'
import { runPnpm } from './lib/pnpm.mjs'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node scripts/pnpm-run.mjs <pnpm-args...>')
  console.error('Example: node scripts/pnpm-run.mjs install')
  process.exit(1)
}

const result = runPnpm(args, { cwd: getRepoRoot() })
process.exit(result?.status ?? 1)
