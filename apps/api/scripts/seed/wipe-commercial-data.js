/**
 * Wipe restaurants, suppliers, and all dependent commercial data.
 * Keeps schema_migrations, subscription_plan rows, feature_flag globals, and admin users.
 */

const WIPE_TABLES = [
  ['deal_interactions'],
  ['deal_promotions'],
  ['promotion_usages'],
  ['promotion_restaurant_targets', 'promotion_targets'],
  ['promotions'],
  ['dispute_attachments', 'dispute_items'],
  ['disputes'],
  ['conversion_event'],
  ['push_subscriptions'],
  ['supplier_reviews', 'supplier_rating_summaries'],
  ['fulfillment_exceptions'],
  ['proof_of_delivery', 'route_stop', 'delivery_route'],
  ['pick_list_item', 'pick_list'],
  ['delivery_wave', 'return_pickup', 'delivery_exception'],
  ['driver_assignments', 'drivers'],
  ['order_warehouse_assignment', 'warehouse_routing_rule', 'warehouse_inventory'],
  ['order_amendment_items', 'order_amendments'],
  ['order_approvals', 'budget_allocations', 'budget_periods', 'approval_rules'],
  ['billing_payment', 'billing_invoice', 'billing_event', 'billing_payment_method'],
  ['subscription_change_log'],
  ['tenant_user_roles', 'tenant_role_permissions', 'tenant_roles'],
  ['user_role'],
  ['tenant_limit_override', 'tenant_account_link'],
  ['restaurant_invitations', 'branch_invitations'],
  [
    'restaurant_org_user_branch_access',
    'restaurant_org_user_roles',
    'restaurant_org_role_permissions',
    'restaurant_org_roles',
    'restaurant_organizations',
  ],
  [
    'org_user_branch_access',
    'org_user_roles',
    'org_role_permissions',
    'org_roles',
    'supplier_organizations',
  ],
  ['supplier_follow', 'supplier_blocklist'],
  ['notification_log'],
  ['notification_preferences'],
  ['restaurant_contact_info', 'supplier_contact_info'],
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
  ['quick_list_item', 'quick_list'],
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
  ['message_attachment', 'message'],
  ['conversation_participant', 'conversation'],
  ['quick_reply_template'],
  ['inventory_movement_log'],
  ['inventory_adjustment'],
  ['restaurant_inventory'],
  ['subscription'],
  ['usage_meter', 'feature_flag_override'],
  ['tenant_usage', 'tenant_plan_snapshot'],
  ['branch'],
  ['inventory_alert'],
  ['inventory'],
  ['product_inventory_settings'],
  ['waste_analytics'],
  ['restaurant_pricing'],
  ['price'],
  ['product'],
  ['catalog'],
  ['delivery_zone'],
  ['warehouse'],
  ['audit_logs'],
  ['system_event'],
  ['restaurant'],
  ['supplier'],
]

async function deleteFromTable(client, table) {
  await client.query('SAVEPOINT wipe_sp')
  try {
    const res = await client.query(`DELETE FROM ${table}`)
    await client.query('RELEASE SAVEPOINT wipe_sp')
    if (res.rowCount > 0) console.log(`   Deleted ${res.rowCount} from ${table}`)
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT wipe_sp').catch(() => {})
    if (e.code === '42P01') return
    throw e
  }
}

async function clearOrgFkOnTenants(client) {
  for (const sql of [
    'UPDATE supplier SET organization_id = NULL WHERE organization_id IS NOT NULL',
    'UPDATE restaurant SET organization_id = NULL WHERE organization_id IS NOT NULL',
  ]) {
    try {
      const res = await client.query(sql)
      if (res.rowCount > 0) console.log(`   Cleared ${res.rowCount} organization_id FK(s)`)
    } catch (e) {
      if (e.code === '42703') continue // column does not exist
      throw e
    }
  }
}

export async function runCommercialWipe(client) {
  console.log('\n🗑️  Wiping restaurants, suppliers, and all commercial data...')

  await clearOrgFkOnTenants(client)

  for (const group of WIPE_TABLES) {
    for (const table of group) {
      await deleteFromTable(client, table)
    }
  }

  try {
    await client.query('SAVEPOINT wipe_sp')
    const res = await client.query(
      `DELETE FROM app_user WHERE role IS DISTINCT FROM 'ADMIN' AND LOWER(email) NOT LIKE 'admin@%'`
    )
    await client.query('RELEASE SAVEPOINT wipe_sp')
    if (res.rowCount > 0) console.log(`   Deleted ${res.rowCount} app_user rows (kept admin)`)
  } catch (e) {
    await client.query('ROLLBACK TO SAVEPOINT wipe_sp').catch(() => {})
    if (e.code !== '42P01') throw e
  }

  console.log('   Wipe complete.\n')
}
