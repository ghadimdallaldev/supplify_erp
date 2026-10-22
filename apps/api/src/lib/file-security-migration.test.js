import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const sql = readFileSync(
  path.join(apiRoot, 'db/migrations/0227_allow_scan_unavailable_file_status.sql'),
  'utf8'
)

describe('file security verdict migration', () => {
  it('allows the scanner-outage verdict emitted by the upload service', () => {
    expect(sql).toMatch(/DROP CONSTRAINT IF EXISTS file_security_scan_status_check/i)
    expect(sql).toMatch(/CHECK\s*\([^;]*'scan_unavailable'[^;]*\)/i)
    expect(sql).toMatch(/VALIDATE CONSTRAINT file_security_scan_status_check/i)
  })
})
