#!/usr/bin/env node
import { getPnpmArgs } from './lib/pnpm.mjs'

const args = getPnpmArgs(['--version'])
if (!args) {
  console.error('Could not run pnpm. Install Node 18+ or run: npm install -g pnpm')
  process.exit(1)
}

console.log('pnpm is available via:', args[0] === 'pnpm' ? 'pnpm' : 'npx pnpm@8.15.0')
