import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const templateType = searchParams.get('type') || 'restaurant-inventory';

    let buffer: Buffer;
    let filename: string;

    if (templateType === 'restaurant-inventory') {
      buffer = generateRestaurantInventoryTemplate();
      filename = 'restaurant_inventory_template.xlsx';
    } else if (templateType === 'supplier-products') {
      buffer = generateSupplierProductTemplate();
      filename = 'supplier_products_template.xlsx';
    } else {
      return NextResponse.json({ error: 'Invalid template type' }, { status: 400 });
    }

    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });

  } catch (error: any) {
    console.error('Template generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Template generation failed' },
      { status: 500 }
    );
  }
}

function generateRestaurantInventoryTemplate(): Buffer {
  const headers = [
    'Item Name',
    'SKU',
    'Storage Type',
    'UOM',
    'Quantity',
    'Unit Cost',
    'Description',
    'Min Stock',
    'Max Stock',
    'Reorder Point',
    'Expiry Date',
    'Lot Code',
  ];

  const sampleData = [
    [
      'Fresh Tomatoes',
      'TOM-001',
      'CHILL',
      'each',
      25,
      2.50,
      'Fresh organic tomatoes',
      5,
      50,
      10,
      '2025-02-15',
      'LOT-001',
    ],
    [
      'Organic Lettuce',
      'LET-001',
      'CHILL',
      'each',
      15,
      3.00,
      'Fresh organic lettuce',
      3,
      30,
      8,
      '2025-02-10',
      'LOT-002',
    ],
    [
      'Premium Onions',
      'ONI-001',
      'DRY',
      'each',
      10,
      1.75,
      'Fresh yellow onions',
      2,
      20,
      5,
      '2025-03-01',
      'LOT-003',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory Template');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function generateSupplierProductTemplate(): Buffer {
  const headers = [
    'Product Name',
    'SKU',
    'Category',
    'Price',
    'Unit',
    'Stock',
    'Description',
    'Barcode',
    'Image URL',
  ];

  const sampleData = [
    [
      'Fresh Tomatoes',
      'TOM-001',
      'Vegetables',
      2.50,
      'each',
      100,
      'Fresh organic tomatoes',
      '1234567890123',
      'https://example.com/tomatoes.jpg',
    ],
    [
      'Organic Lettuce',
      'LET-001',
      'Vegetables',
      3.00,
      'each',
      50,
      'Fresh organic lettuce',
      '1234567890124',
      'https://example.com/lettuce.jpg',
    ],
    [
      'Premium Onions',
      'ONI-001',
      'Vegetables',
      1.75,
      'each',
      75,
      'Fresh yellow onions',
      '1234567890125',
      'https://example.com/onions.jpg',
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleData]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Product Template');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}
