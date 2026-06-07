/**
 * Batch replace org-level role permissions (restaurant_org_role_permissions / org_role_permissions).
 * Table names are fixed constants from callers — never pass user input.
 */

/** Return true when stored permissions + branch_scope already match expected (skip DELETE+INSERT). */
export async function orgRolePermissionsUnchanged(
  db,
  { permissionsTable, roleId, permissions, branchScope }
) {
  const { rows } = await db(
    `SELECT permission, branch_scope FROM ${permissionsTable} WHERE role_id = $1 ORDER BY permission`,
    [roleId]
  )
  const expected = [...(permissions || [])].sort()
  const current = rows.map((r) => r.permission).sort()
  if (current.length !== expected.length) return false
  if (!current.every((p, i) => p === expected[i])) return false
  return rows.every((r) => r.branch_scope === branchScope)
}

export async function replaceOrgRolePermissions(
  db,
  { permissionsTable, roleId, permissions, branchScope }
) {
  await db(`DELETE FROM ${permissionsTable} WHERE role_id = $1`, [roleId])
  if (!permissions?.length) return

  const valueClauses = []
  const params = [roleId]
  let paramIndex = 2
  for (const permission of permissions) {
    valueClauses.push(`($1, $${paramIndex}, $${paramIndex + 1})`)
    params.push(permission, branchScope)
    paramIndex += 2
  }

  await db(
    `INSERT INTO ${permissionsTable} (role_id, permission, branch_scope)
     VALUES ${valueClauses.join(', ')}
     ON CONFLICT (role_id, permission) DO UPDATE SET branch_scope = EXCLUDED.branch_scope`,
    params
  )
}
