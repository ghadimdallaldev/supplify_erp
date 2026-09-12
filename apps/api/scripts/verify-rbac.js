/**
 * Verify RBAC tables and permission resolution.
 * Run after migrations 0041, 0042, 0043: node scripts/verify-rbac.js
 */
import { query } from '../src/lib/db.js'

async function verifyRbac() {
  console.log('RBAC verification\n')

  try {
    const { rows: roleCount } = await query('SELECT COUNT(*) AS n FROM role')
    console.log('Roles:', roleCount[0].n)
    if (Number(roleCount[0].n) < 10) {
      console.warn('  Expected at least 10 roles (restaurant/supplier/admin)')
    }

    const { rows: permCount } = await query('SELECT COUNT(*) AS n FROM permission')
    console.log('Permissions:', permCount[0].n)
    if (Number(permCount[0].n) < 30) {
      console.warn('  Expected many permissions (ORDERS_*, INVOICES_*, etc.)')
    }

    const { rows: rpCount } = await query('SELECT COUNT(*) AS n FROM role_permission')
    console.log('Role–permission mappings:', rpCount[0].n)

    const { rows: urCount } = await query('SELECT COUNT(*) AS n FROM user_role')
    console.log('User–role assignments:', urCount[0].n)

    const { rows: sampleUser } = await query(
      `SELECT ur.user_id, ur.tenant_id, ur.tenant_type, r.code AS role_code
       FROM user_role ur
       JOIN role r ON r.id = ur.role_id
       LIMIT 1`
    )
    if (sampleUser.length === 0) {
      console.log('\nNo user_role rows yet (run 0043 or assign roles manually).')
      return
    }

    const { user_id, tenant_id, tenant_type, role_code } = sampleUser[0]
    console.log('\nSample user_role:', { user_id, tenant_id, tenant_type, role_code })

    const { rows: perms } = await query(
      `SELECT DISTINCT p.code
       FROM user_role ur
       JOIN role r ON r.id = ur.role_id
       JOIN role_permission rp ON rp.role_id = r.id
       JOIN permission p ON p.id = rp.permission_id
       WHERE ur.user_id = $1 AND ur.tenant_type = $2
         AND ((ur.tenant_id IS NULL AND $3::uuid IS NULL) OR ur.tenant_id = $3)`,
      [user_id, tenant_type, tenant_id]
    )
    const codes = perms.map((r) => r.code)
    console.log('Resolved permissions for sample user:', codes.length)
    const hasSettings = codes.includes('SETTINGS_VIEW') || codes.includes('SETTINGS_MANAGE')
    console.log('  Has SETTINGS_VIEW or SETTINGS_MANAGE:', hasSettings ? 'yes' : 'no')
    if (!hasSettings && tenant_type !== 'ADMIN') {
      console.warn('  Staff/Manager roles may not have SETTINGS_* (expected for RESTAURANT_STAFF)')
    }

    console.log('\n✓ RBAC verification done')
  } catch (err) {
    if (err.code === '42P01') {
      console.error('RBAC tables missing. Run migrations 0041, 0042, 0043.')
    } else {
      console.error(err)
    }
    process.exit(1)
  }
}

verifyRbac()
