import pg from 'pg';
import dotenv from 'dotenv';
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

// Common tags mapping based on category
const categoryTags: Record<string, string[]> = {
  'Vegetables': ['fresh', 'vegetable', 'produce', 'healthy'],
  'Meat & Poultry': ['meat', 'protein', 'fresh', 'quality'],
  'Seafood': ['seafood', 'fish', 'fresh', 'frozen'],
  'Grains & Legumes': ['grain', 'staple', 'protein', 'healthy'],
  'Oils & Fats': ['oil', 'cooking', 'ingredient'],
  'Dairy': ['dairy', 'fresh', 'refrigerated'],
  'Beverages': ['beverage', 'drink', 'hydrating'],
  'Spices & Seasonings': ['spice', 'seasoning', 'flavor'],
  'Canned & Preserved': ['canned', 'preserved', 'shelf-stable'],
  'Bakery & Bread': ['bakery', 'fresh', 'daily'],
  'Frozen Foods': ['frozen', 'convenient'],
  'Snacks & Nuts': ['snack', 'nuts', 'healthy'],
  'Condiments & Sauces': ['condiment', 'sauce', 'flavoring'],
  'Cleaning Supplies': ['cleaning', 'supply', 'maintenance'],
  'Paper & Disposables': ['disposable', 'supply'],
};

async function addTagsToProducts() {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    console.log('🏷️  Adding tags to existing products...\n');
    
    // Get all products without tags or with empty tags
    const { rows: products } = await client.query(`
      SELECT p.id, p.name, p.category, pc.name as category_name
      FROM product p
      LEFT JOIN product_category pc ON pc.id = p.category_id
      WHERE p.tags IS NULL OR jsonb_array_length(p.tags) = 0
    `);
    
    console.log(`   Found ${products.length} products without tags\n`);
    
    let updated = 0;
    
    for (const product of products) {
      const tags: string[] = [];
      
      // Add category-based tags
      const categoryName = product.category_name || product.category || '';
      if (categoryName && categoryTags[categoryName]) {
        tags.push(...categoryTags[categoryName]);
      }
      
      // Add name-based tags (extract keywords)
      const nameLower = product.name.toLowerCase();
      if (nameLower.includes('organic')) tags.push('organic');
      if (nameLower.includes('fresh')) tags.push('fresh');
      if (nameLower.includes('local')) tags.push('local');
      if (nameLower.includes('premium')) tags.push('premium');
      if (nameLower.includes('bulk')) tags.push('bulk');
      if (nameLower.includes('fresh')) tags.push('fresh');
      if (nameLower.includes('frozen')) tags.push('frozen');
      
      // Remove duplicates
      const uniqueTags = Array.from(new Set(tags));
      
      if (uniqueTags.length > 0) {
        await client.query(`
          UPDATE product
          SET tags = $1::jsonb, updated_at = now()
          WHERE id = $2
        `, [JSON.stringify(uniqueTags), product.id]);
        
        updated++;
        if (updated % 10 === 0) {
          console.log(`   ✓ Updated ${updated}/${products.length} products...`);
        }
      }
    }
    
    await client.query('COMMIT');
    
    console.log(`\n✅ Successfully added tags to ${updated} products!`);
    
    // Show tag distribution
    const { rows: tagStats } = await client.query(`
      SELECT tag, COUNT(*) as count
      FROM product, jsonb_array_elements_text(tags) AS tag
      WHERE tags IS NOT NULL AND jsonb_array_length(tags) > 0
      GROUP BY tag
      ORDER BY count DESC
      LIMIT 20
    `);
    
    console.log('\n📊 Top tags:');
    tagStats.forEach((row, idx) => {
      console.log(`   ${idx + 1}. ${row.tag}: ${row.count} products`);
    });
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

addTagsToProducts()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Failed:', error);
    process.exit(1);
  });

