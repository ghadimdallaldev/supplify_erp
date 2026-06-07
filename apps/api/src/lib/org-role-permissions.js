/**
 * Batch replace org-level role permissions (restaurant_org_role_permissions / org_role_permissions).
 * Table names are fixed constants from callers — never pass user input.
 */
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
