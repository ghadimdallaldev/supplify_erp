#!/usr/bin/env node
/**
 * Compatibility shim — full OpenAPI spec generation is not implemented yet.
 * Exports route inventory JSON/Markdown via discover-routes.mjs (see docs/api/).
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const discover = path.join(__dirname, 'discover-routes.mjs')

console.warn(
  'openapi:gen runs discover-routes (route inventory). Full OpenAPI client codegen is not wired yet.'
)

const result = spawnSync(process.execPath, [discover], { stdio: 'inherit' })
process.exit(result.status ?? 1)
