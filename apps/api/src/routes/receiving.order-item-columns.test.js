import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Regression guard: receiving.routes.js once ordered receipt lines by `oi.created_at`, a column
// order_item never had. Route tests mock the database, so the SQL error only surfaced at runtime
// ("column oi.created_at does not exist") and blocked every receipt. This test checks each `oi.<col>`
// reference in the receiving routes against the order_item columns declared in the migrations.

const here = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(here, '../../db/migrations')

function orderItemColumns() {
  const columns = new Set()
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    const sql = readFileSync(join(migrationsDir, file), 'utf8')
    const create = sql.match(/CREATE TABLE (?:IF NOT EXISTS )?order_item\s*\(([\s\S]*?)\n\);/i)
    if (create) {
      for (const line of create[1].split('\n')) {
        const col = line.trim().match(/^([a-z_][a-z0-9_]*)\s+[A-Z]/)
        if (col) columns.add(col[1])
      }
    }
    for (const alter of sql.matchAll(/ALTER TABLE (?:IF EXISTS )?order_item\b([\s\S]*?);/gi)) {
      for (const add of alter[1].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)/gi)) {
        columns.add(add[1])
      }
    }
  }
  return columns
}

describe('receiving routes order_item column references', () => {
  it('only references order_item columns that exist in the schema', () => {
    const columns = orderItemColumns()
    expect(columns.has('order_id')).toBe(true)
    const source = readFileSync(join(here, 'receiving.routes.js'), 'utf8')
    const referenced = new Set([...source.matchAll(/\boi\.([a-z_][a-z0-9_]*)/g)].map((m) => m[1]))
    const missing = [...referenced].filter((col) => !columns.has(col))
    expect(missing).toEqual([])
  })
})
