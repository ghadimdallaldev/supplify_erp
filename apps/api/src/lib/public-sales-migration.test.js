import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sql = readFileSync(path.join(apiRoot, 'db/migrations/0223_supplier_public_sales.sql'), 'utf8')

describe('supplier public sales migration', () => {
  it('adds consumer identity and address tables without tenant ownership', () => {
    expect(sql).toContain("role IN ('ADMIN', 'SUPPLIER', 'RESTAURANT', 'CONSUMER'")
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS consumer_profile/i)
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS consumer_address/i)
  })

  it('backfills restaurant orders and enforces customer ownership by type', () => {
    expect(sql).toMatch(/customer_type[^;]+DEFAULT 'RESTAURANT'/is)
    expect(sql).toMatch(/UPDATE customer_order\s+SET customer_type = 'RESTAURANT'/i)
    expect(sql).toContain("customer_type = 'CONSUMER'")
    expect(sql).toContain("customer_type = 'GUEST'")
  })

  it('stores only a token hash and generalizes idempotency actor scope', () => {
    expect(sql).toMatch(/customer_order_public_access[\s\S]+token_hash TEXT NOT NULL UNIQUE/i)
    expect(sql).not.toMatch(/customer_order_public_access[\s\S]+raw_token/i)
    expect(sql).toMatch(/order_placement_idempotency[\s\S]+actor_scope/i)
  })

  it('makes the contact snapshot immutable after placement', () => {
    expect(sql).toMatch(/protect_customer_order_contact_snapshot/i)
    expect(sql).toMatch(/BEFORE UPDATE OF customer_contact_snapshot/i)
  })
})
