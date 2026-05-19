/**
 * Wipe restaurants, suppliers, and related commercial data (keeps schema_migrations + admin user).
 */
export async function runCommercialWipe(client) {
  console.log('\n🗑️  Wiping tenants, users (except admin), and commercial data...')

  const tables = [
    ['promotion_usages'],
    ['promotion_restaurant_targets', 'promotion_targets'],
    ['promotions'],
    ['dispute_attachments', 'dispute_items'],
    ['disputes'],
    ['tenant_user_roles'],
    ['tenant_role_permissions'],
    ['tenant_roles'],
    ['user_role'],
    ['payment'],
    ['invoice_line_item', 'dunning'],
    ['credit_note_line_item'],
    ['credit_note'],
    ['account_statement'],
    ['invoice_sequence'],
    ['invoice'],
    ['receiving_line_item'],
    ['receiving_report'],
    ['order_item'],
    ['customer_order'],
    ['reservation_waitlist'],
    ['reservation'],
    ['reservation_table'],
    ['staff_shift_swap', 'staff_time_entry', 'staff_shift'],
    [
      'staff_pto_request',
      'staff_availability',
      'staff_announcement_ack',
      'staff_document',
      'staff_incident',
      'staff_performance_note',
      'staff_payroll_export',
    ],
    ['staff_member'],
    ['restaurant_team'],
    ['inventory_movement_log'],
    ['inventory_adjustment'],
    ['restaurant_inventory'],
    ['subscription'],
    ['usage_meter'],
    ['feature_flag_override'],
    ['tenant_usage', 'tenant_plan_snapshot'],
    ['branch'],
    ['inventory_alert'],
    ['inventory'],
    ['product_inventory_settings'],
    ['price'],
    ['product'],
    ['catalog'],
    ['delivery_zone'],
    ['warehouse'],
    ['restaurant'],
    ['supplier'],
  ]

  for (const group of tables) {
    for (const table of group) {
      try {
        const res = await client.query(`DELETE FROM ${table}`)
        if (res.rowCount > 0) console.log(`   Deleted ${res.rowCount} from ${table}`)
      } catch (e) {
        if (e.code === '42P01') continue
        throw e
      }
    }
  }

  try {
    const res = await client.query(
      `DELETE FROM app_user WHERE role IS DISTINCT FROM 'ADMIN' AND LOWER(email) NOT LIKE 'admin@%'`
    )
    if (res.rowCount > 0) console.log(`   Deleted ${res.rowCount} app_user rows (kept admin)`)
  } catch (e) {
    if (e.code !== '42P01') throw e
  }

  console.log('   Wipe complete.\n')
}
