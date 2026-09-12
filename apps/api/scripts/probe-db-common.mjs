import pg from 'pg'

const candidates = [
  'postgresql://postgres:postgres@127.0.0.1:5432/supplify',
  'postgresql://postgres:postgres@127.0.0.1:5432/postgres',
  'postgresql://postgres:postgres@127.0.0.1:5455/postgres',
  'postgresql://postgres:postgres@127.0.0.1:5455/postgres_docker',
]

for (const cs of candidates) {
  const c = new pg.Client({ connectionString: cs, connectionTimeoutMillis: 3000 })
  const redacted = cs.replace(/:[^:@]+@/, ':***@')
  try {
    await c.connect()
    const r = await c.query('SELECT current_database() AS db')
    let restaurants = null
    try {
      const rr = await c.query('SELECT COUNT(*)::int AS c FROM restaurant')
      restaurants = rr.rows[0].c
    } catch {
      restaurants = 'no restaurant table'
    }
    console.log('OK', redacted, r.rows[0], { restaurants })
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
