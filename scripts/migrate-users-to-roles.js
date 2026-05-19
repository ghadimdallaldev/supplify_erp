#!/usr/bin/env node
/**
 * Repo-root entrypoint — delegates to apps/api/scripts/migrate-users-to-roles.js
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const script = join(dirname(fileURLToPath(import.meta.url)), '../apps/api/scripts/migrate-users-to-roles.js')
const child = spawn(process.execPath, [script], { stdio: 'inherit', env: process.env })
child.on('exit', (code) => process.exit(code ?? 1))
