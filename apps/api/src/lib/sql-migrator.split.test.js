import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { splitMigrationStatements } from './sql-migrator.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '..', '..', 'db', 'migrations')

describe('splitMigrationStatements', () => {
  it('keeps DO $$ blocks intact in 0171', () => {
    const sql = readFileSync(join(migrationsDir, '0171_audit_integrity_fixes.sql'), 'utf8')
    const statements = splitMigrationStatements(sql)

    expect(statements).toHaveLength(7)
    expect(statements[0]).toMatch(/DO \$\$/)

    const broken = statements.filter((s) => /^\s*(IF|END IF)\b/i.test(s))
    expect(broken).toHaveLength(0)
  })
})
