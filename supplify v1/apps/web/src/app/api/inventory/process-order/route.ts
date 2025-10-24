import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { orderId, restaurantId, supplierId, items } = body;

    // Validate required fields
    if (!orderId || !restaurantId || !supplierId || !items || !Array.isArray(items)) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Try to call the real inventory service first
    try {
      const inventoryServiceUrl = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3005';
      const response = await fetch(`${inventoryServiceUrl}/inventory/process-order`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orderId,
          restaurantId,
          supplierId,
          items,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return NextResponse.json(result);
      } else {
        console.warn('Inventory service not available, falling back to local processing');
      }
    } catch (serviceError) {
      console.warn('Inventory service not available, falling back to local processing:', serviceError);
    }

    // Fallback: Use local processing (temporary until service is running)
    const { inventoryDB } = await import('../../../../lib/inventory-db');
    inventoryDB.addItemsFromOrder(orderId, restaurantId, items);

    return NextResponse.json({
      success: true,
      message: `Added ${items.length} items to inventory from order ${orderId} (local processing)`,
      orderId,
      itemsProcessed: items.length,
    });
  } catch (error) {
    console.error('Error processing order delivery:', error);
    return NextResponse.json(
      { error: 'Failed to process order delivery' },
      { status: 500 }
    );
  }
}
