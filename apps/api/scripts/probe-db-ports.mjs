import dotenv from 'dotenv'
import path from 'path'
import pg from 'pg'

dotenv.config({ path: path.resolve('.env') })
const base = process.env.DATABASE_URL
const u = new URL(base.replace(/^postgres(ql)?:\/\//, 'postgresql://'))
const pass = decodeURIComponent(u.password || '')
const user = decodeURIComponent(u.username || 'postgres')
const db = u.pathname.replace(/^\//, '').split('?')[0] || 'supplify'

const candidates = [
  `postgresql://${user}:${encodeURIComponent(pass)}@127.0.0.1:5432/${db}`,
  `postgresql://${user}:${encodeURIComponent(pass)}@127.0.0.1:5455/${db}`,
]

for (const cs of candidates) {
  const c = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 4000 })
  const redacted = cs.replace(/:[^:@]+@/, ':***@')
  try {
    await c.connect()
    const r = await c.query(
      'SELECT current_database() AS db, (SELECT COUNT(*)::int FROM restaurant) AS restaurants'
    )
    const cols = await c.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name='subscription'
        AND column_name IN ('trial_target_plan_id','billing_review_required')
      ORDER BY 1
    `)
    console.log('OK', redacted, r.rows[0], cols.rows.map((x) => x.column_name))
    await c.end()
  } catch (e) {
    console.log('FAIL', redacted, e.code || e.message)
    try {
      await c.end()
    } catch {
      /* ignore */
    }
  }
}
