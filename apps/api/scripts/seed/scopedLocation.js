/** Branch/warehouse inserts across migration-era schemas (supplier_id + tenant_id, etc.). */

export async function getScopedInsertShape(client, tableName, fkCandidates, optionalCols = []) {
  const names = [...fkCandidates, 'address', 'address_json', 'is_main', 'code', ...optionalCols]
  const { rows } = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = ANY($2::text[])`,
    [tableName, names]
  )
  const cols = new Set(rows.map((r) => r.column_name))
  return {
    fkCols: fkCandidates.filter((c) => cols.has(c)),
    addressCol: cols.has('address') ? 'address' : cols.has('address_json') ? 'address_json' : null,
    hasCode: cols.has('code'),
    hasIsMain: cols.has('is_main'),
  }
}

export async function insertScopedLocation(
  client,
  tableName,
  shape,
  { id, tenantId, name, code, addressJson, isMain }
) {
  const columns = ['id', ...shape.fkCols]
  const values = [id, ...shape.fkCols.map(() => tenantId)]
  if (shape.addressCol && addressJson != null) {
    columns.push(shape.addressCol)
    values.push(addressJson)
  }
  columns.push('name')
  values.push(name)
  if (shape.hasCode && code != null) {
    columns.push('code')
    values.push(code)
  }
  if (shape.hasIsMain) {
    columns.push('is_main')
    values.push(isMain)
  }
  columns.push('is_active', 'created_at', 'updated_at')
  const placeholders = values.map((_, i) => `$${i + 1}`)
  placeholders.push('true', 'NOW()', 'NOW()')
  await client.query(
    `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`,
    values
  )
}
