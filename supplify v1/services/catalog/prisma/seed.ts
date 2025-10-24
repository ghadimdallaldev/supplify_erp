import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create categories
  const dairy = await prisma.category.create({
    data: {
      name: 'Dairy Products',
      slug: 'dairy-products',
      path: 'dairy-products',
    },
  });

  const vegetables = await prisma.category.create({
    data: {
      name: 'Fresh Vegetables',
      slug: 'fresh-vegetables',
      path: 'fresh-vegetables',
    },
  });

  console.log('Created categories:', { dairy, vegetables });

  // Create products
  const products = [
    {
      name: 'Fresh Milk 1L',
      slug: 'fresh-milk-1l',
      supplierId: 'supplier_1',
      categoryId: dairy.id,
      unit: 'l',
      packSize: '1L',
      price: 2.5,
      stockQty: 100,
      minOrderQty: 1,
      imageKeys: [],
      attributes: { organic: true },
    },
    {
      name: 'Cheddar Cheese 500g',
      slug: 'cheddar-cheese-500g',
      supplierId: 'supplier_1',
      categoryId: dairy.id,
      unit: 'kg',
      packSize: '500g',
      price: 8.99,
      stockQty: 50,
      minOrderQty: 1,
      imageKeys: [],
      attributes: { aged: '12 months' },
    },
    {
      name: 'Fresh Tomatoes',
      slug: 'fresh-tomatoes',
      supplierId: 'supplier_2',
      categoryId: vegetables.id,
      unit: 'kg',
      packSize: '1kg',
      price: 3.5,
      stockQty: 200,
      minOrderQty: 2,
      imageKeys: [],
      attributes: { origin: 'Local' },
    },
    {
      name: 'Organic Carrots',
      slug: 'organic-carrots',
      supplierId: 'supplier_2',
      categoryId: vegetables.id,
      unit: 'kg',
      packSize: '1kg',
      price: 2.99,
      stockQty: 150,
      minOrderQty: 2,
      imageKeys: [],
      attributes: { organic: true, origin: 'Local' },
    },
  ];

  for (const product of products) {
    await prisma.product.create({ data: product });
  }

  console.log('Created products');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

