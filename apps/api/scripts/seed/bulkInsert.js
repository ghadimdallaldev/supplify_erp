/**
 * Batch insert helper: builds a single INSERT with many rows and runs in one query.
 * Uses parameterized placeholders $1, $2, ... to avoid SQL injection.
 *
 * @param {import('pg').PoolClient} client
 * @param {object} options
 * @param {string} options.table - Table name
 * @param {string[]} options.columns - Column names in order
 * @param {Array<unknown[]>} options.rows - Array of value arrays (one per row, same length as columns)
 * @param {number} [options.chunkSize=500] - Max rows per INSERT (some DBs limit params)
 */
export async function bulkInsert(client, { table, columns, rows, chunkSize = 500 }) {
  if (rows.length === 0) return;
  const colList = columns.join(', ');
  const placeholdersPerRow = columns.length;
  let inserted = 0;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    const values = chunk.flat();
    const placeholders = chunk
      .map(
        (_, i) =>
          '(' +
          Array.from({ length: placeholdersPerRow }, (_, j) => `$${i * placeholdersPerRow + j + 1}`).join(', ') +
          ')'
      )
      .join(', ');
    const sql = `INSERT INTO ${table} (${colList}) VALUES ${placeholders}`;
    await client.query(sql, values);
    inserted += chunk.length;
  }
  return inserted;
}
