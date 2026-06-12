import pg from 'pg'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const { Pool } = pg
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../../.env') })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
})

async function addSupplier() {
  console.log('🔧 Adding supplier for supplier@example.com...\n')

  try {
    // Check if supplier already exists
    const { rows: existing } = await pool.query(
      'SELECT * FROM supplier WHERE contact_email = $1',
      ['supplier@example.com']
    )

    if (existing.length > 0) {
      console.log('✅ Supplier already exists:', existing[0])
      await pool.end()
      return
    }

    // Add supplier
    const addressJson = { street: '100 Example Street', city: 'Example City', country: 'USA' }
    const { rows: suppliers } = await pool.query(`
      INSERT INTO supplier (name, slug, contact_email, phone, address_json)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [
      'Example Supplier',
      'example-supplier',
      'supplier@example.com',
      '+1234567899',
      JSON.stringify(addressJson)
    ])

    console.log('✅ Supplier added successfully:', suppliers[0])
    console.log('\n📧 Email: supplier@example.com')
    console.log('🏢 Name: Example Supplier')
    console.log('📞 Phone: +1234567899')

  } catch (error) {
    console.error('❌ Error adding supplier:', error)
    throw error
  } finally {
    await pool.end()
  }
}

addSupplier()
