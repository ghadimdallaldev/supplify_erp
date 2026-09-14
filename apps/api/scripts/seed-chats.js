/**
 * Seed chat conversations and messages between all restaurants and their
 * corresponding suppliers (pairs that have at least one order).
 * Run after prodlike seed so you can test the chat feature.
 *
 * Usage: node scripts/seed-chats.js
 * Optional: SEED=1337 (default) for determinism
 */
import 'dotenv/config'
import { pool } from '../src/lib/db.js'
import { createSeededRng, intBetween, pick } from './seed/seedRng.js'

const SEED = parseInt(process.env.SEED || '1337', 10)
const rng = createSeededRng(SEED)

const RESTAURANT_MESSAGES = [
  'Hi, when can we expect the delivery for order #ORD-001?',
  'Thanks for the quick turnaround last time.',
  'Do you have organic tomatoes in stock this week?',
  'Can we add 5 more cases to our next order?',
  "What's the lead time for bulk flour?",
  'We need to confirm the invoice for last month.',
  'Is the minimum order still 10 cases?',
  'Please confirm you received our order from yesterday.',
]

const SUPPLIER_MESSAGES = [
  'Your order will ship tomorrow morning.',
  'We have a new seasonal product you might like.',
  'Delivery is scheduled for Thursday between 9–11am.',
  'Thanks for your order. Invoice attached.',
  "We're running low on that SKU; I can suggest an alternative.",
  'Payment received. Thank you!',
  'Let me check stock and get back to you in an hour.',
  'Our driver will call 30 minutes before arrival.',
]

async function main() {
  console.log('💬 Seeding chats between restaurants and their suppliers (SEED=' + SEED + ')\n')

  const client = await pool.connect()
  try {
    const { rows: pairs } = await client.query(`
      SELECT DISTINCT o.restaurant_id, oi.supplier_id
      FROM customer_order o
      JOIN order_item oi ON oi.order_id = o.id
      ORDER BY o.restaurant_id, oi.supplier_id
    `)

    if (pairs.length === 0) {
      console.log('No restaurant–supplier pairs found (no orders). Run seed:prodlike first.')
      process.exit(1)
    }

    console.log('Found', pairs.length, 'restaurant–supplier pairs from orders.\n')

    let conversationCount = 0
    let messageCount = 0

    for (const { restaurant_id, supplier_id } of pairs) {
      const { rows: convRows } = await client.query(
        `INSERT INTO conversation (supplier_id, restaurant_id)
         VALUES ($1, $2)
         ON CONFLICT (supplier_id, restaurant_id) DO UPDATE SET updated_at = now()
         RETURNING id`,
        [supplier_id, restaurant_id]
      )
      const conversationId = convRows[0].id

      await client.query(
        `INSERT INTO conversation_participant (conversation_id, participant_type, participant_id)
         VALUES ($1, 'SUPPLIER', $2), ($1, 'RESTAURANT', $3)
         ON CONFLICT (conversation_id, participant_type) DO NOTHING`,
        [conversationId, supplier_id, restaurant_id]
      )

      conversationCount++

      const numMessages = intBetween(rng, 2, 6)
      for (let i = 0; i < numMessages; i++) {
        const isRestaurant = i % 2 === 0
        const senderType = isRestaurant ? 'RESTAURANT' : 'SUPPLIER'
        const senderId = isRestaurant ? restaurant_id : supplier_id
        const content = isRestaurant ? pick(rng, RESTAURANT_MESSAGES) : pick(rng, SUPPLIER_MESSAGES)
        const minutesAgo = i * 15
        await client.query(
          `INSERT INTO message (conversation_id, sender_type, sender_id, content, message_type, is_read, created_at, updated_at)
           VALUES ($1, $2, $3, $4, 'TEXT', true, now() - ($5::text || ' minutes')::interval, now() - ($5::text || ' minutes')::interval)`,
          [conversationId, senderType, senderId, content, minutesAgo]
        )
        messageCount++
      }
    }

    console.log('   Conversations: ' + conversationCount)
    console.log('   Messages: ' + messageCount)
    console.log('\n✅ Chat seed done. Log in as any restaurant or supplier to see chats.')
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
