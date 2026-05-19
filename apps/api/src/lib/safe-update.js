/**
 * Build parameterized SET clauses from a whitelisted field map (prevents SQL mass-assignment).
 * @param {Record<string, unknown>} data - parsed update payload
 * @param {Record<string, string>} fieldMap - apiField -> db column
 * @param {{ startIndex?: number, valueTransform?: (dbField: string, value: unknown) => unknown }} [options]
 */
export function buildWhitelistedUpdate(data, fieldMap, options = {}) {
  const startIndex = options.startIndex ?? 1
  const fields = []
  const values = []
  let paramIndex = startIndex

  for (const [apiField, dbField] of Object.entries(fieldMap)) {
    const value = data[apiField]
    if (value === undefined) continue
    fields.push(`${dbField} = $${paramIndex}`)
    values.push(options.valueTransform ? options.valueTransform(dbField, value) : value)
    paramIndex++
  }

  return { fields, values, nextIndex: paramIndex }
}
