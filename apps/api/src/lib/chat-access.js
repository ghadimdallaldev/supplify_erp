import { query } from './db.js'

/**
 * Verify the app user may access a chat conversation (supplier/restaurant participant or admin).
 */
export async function userCanAccessConversation(appUserId, conversationId) {
  const { rows: convRows } = await query(
    'SELECT id, supplier_id, restaurant_id FROM conversation WHERE id = $1',
    [conversationId]
  )
  if (convRows.length === 0) return false
  const conversation = convRows[0]

  const { rows: userRows } = await query('SELECT id, email, role FROM app_user WHERE id = $1', [
    appUserId,
  ])
  if (userRows.length === 0) return false
  const appUser = userRows[0]

  if (appUser.role === 'ADMIN') return true

  if (appUser.role === 'SUPPLIER') {
    const { rows } = await query(
      'SELECT 1 FROM supplier WHERE id = $1 AND LOWER(TRIM(contact_email)) = LOWER(TRIM($2))',
      [conversation.supplier_id, appUser.email]
    )
    return rows.length > 0
  }

  if (appUser.role === 'RESTAURANT') {
    const { rows } = await query(
      'SELECT 1 FROM restaurant WHERE id = $1 AND LOWER(TRIM(contact_email)) = LOWER(TRIM($2))',
      [conversation.restaurant_id, appUser.email]
    )
    return rows.length > 0
  }

  return false
}
