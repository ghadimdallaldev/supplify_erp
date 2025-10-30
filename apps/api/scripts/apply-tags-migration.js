import pg from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../../.env') });

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/supplify',
});

async function applyMigration() {
  const client = await pool.connect();
  
  try {
    console.log('📦 Applying product tags and categories migration...\n');
    
    const sql = readFileSync(join(__dirname, '../db/migrations/0026_product_tags_categories.sql'), 'utf8');
    
    await client.query('BEGIN');
    
    // Split and run each statement
    const statements = sql.split(';').filter(s => s.trim()).map(s => s.trim() + ';');
    
    for (const statement of statements) {
      if (statement.trim() && !statement.trim().startsWith('--')) {
        try {
          await client.query(statement);
        } catch (error) {
          // Ignore "already exists" errors
          if (error.code !== '42P07' && error.code !== '42710') {
            console.error('Error:', error.message);
            throw error;
          }
        }
      }
    }
    
    await client.query('COMMIT');
    
    // Check if migration was already recorded
    const { rows: existing } = await client.query(
      "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE migration = $1)",
      ['0026_product_tags_categories.sql']
    );
    
    if (!existing[0].exists) {
      await client.query(
        "INSERT INTO schema_migrations (migration) VALUES ($1)",
        ['0026_product_tags_categories.sql']
      );
    }
    
    console.log('✅ Migration applied successfully!\n');
    
    // Wait a moment for table creation to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Run tag seeding
    console.log('🏷️  Adding tags to existing products...\n');
    
    // First, link products to categories based on category name
    const { rows: linkResult } = await client.query(`
      UPDATE product p
      SET category_id = pc.id
      FROM product_category pc
      WHERE p.category = pc.name
        AND p.category_id IS NULL
      RETURNING p.id
    `);
    console.log(`✅ Linked ${linkResult.length} products to categories\n`);
    
    // Then add tags based on category
    const { rows: tagResult } = await client.query(`
      UPDATE product p
      SET tags = COALESCE(
        CASE 
          WHEN pc.name = 'Vegetables' THEN '["fresh", "vegetable", "produce", "healthy"]'::jsonb
          WHEN pc.name = 'Meat & Poultry' THEN '["meat", "protein", "fresh", "quality"]'::jsonb
          WHEN pc.name = 'Seafood' THEN '["seafood", "fish", "fresh", "frozen"]'::jsonb
          WHEN pc.name = 'Grains & Legumes' THEN '["grain", "staple", "protein", "healthy"]'::jsonb
          WHEN pc.name = 'Oils & Fats' THEN '["oil", "cooking", "ingredient"]'::jsonb
          WHEN pc.name = 'Dairy' THEN '["dairy", "fresh", "refrigerated"]'::jsonb
          WHEN pc.name = 'Beverages' THEN '["beverage", "drink", "hydrating"]'::jsonb
          WHEN pc.name = 'Spices & Seasonings' THEN '["spice", "seasoning", "flavor"]'::jsonb
          WHEN pc.name = 'Canned & Preserved' THEN '["canned", "preserved", "shelf-stable"]'::jsonb
          WHEN pc.name = 'Bakery & Bread' THEN '["bakery", "fresh", "daily"]'::jsonb
          WHEN pc.name = 'Frozen Foods' THEN '["frozen", "convenient"]'::jsonb
          WHEN pc.name = 'Snacks & Nuts' THEN '["snack", "nuts", "healthy"]'::jsonb
          WHEN pc.name = 'Condiments & Sauces' THEN '["condiment", "sauce", "flavoring"]'::jsonb
          WHEN p.category = 'Vegetables' OR p.category ILIKE '%vegetable%' THEN '["fresh", "vegetable", "produce"]'::jsonb
          WHEN p.category = 'Meat' OR p.category ILIKE '%meat%' THEN '["meat", "protein", "fresh"]'::jsonb
          WHEN p.category = 'Grains' OR p.category ILIKE '%grain%' THEN '["grain", "staple"]'::jsonb
          WHEN p.category = 'Oils' OR p.category ILIKE '%oil%' THEN '["oil", "cooking"]'::jsonb
          WHEN p.category = 'Dairy' OR p.category ILIKE '%dairy%' THEN '["dairy", "fresh"]'::jsonb
          ELSE '["general"]'::jsonb
        END,
        '[]'::jsonb
      ),
      updated_at = now()
      FROM product_category pc
      WHERE (p.category_id = pc.id OR p.category = pc.name)
        AND (p.tags IS NULL OR jsonb_array_length(COALESCE(p.tags, '[]'::jsonb)) = 0)
      RETURNING p.id
    `);
    
    const { rows: count } = await client.query('SELECT COUNT(*) as count FROM product WHERE tags IS NOT NULL AND jsonb_array_length(COALESCE(tags, \'[]\'::jsonb)) > 0');
    console.log(`✅ Added tags to ${tagResult.length} products (total: ${count[0].count} products with tags)\n`);
    
    console.log('✨ All done!');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('💥 Failed:', error);
    process.exit(1);
  });

