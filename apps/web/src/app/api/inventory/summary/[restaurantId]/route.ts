import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { restaurantId: string } }
) {
  try {
    const { restaurantId } = params;
    
    // Try to call the real inventory service first
    try {
      const inventoryServiceUrl = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3005';
      const response = await fetch(`${inventoryServiceUrl}/inventory/summary/${restaurantId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const result = await response.json();
        return NextResponse.json(result);
      } else {
        console.warn('Inventory service not available, falling back to local data');
      }
    } catch (serviceError) {
      console.warn('Inventory service not available, falling back to local data:', serviceError);
    }

    // Fallback: Use local data
    const { inventoryDB } = await import('../../../../../lib/inventory-db');
    const inventorySummary = inventoryDB.getInventorySummary(restaurantId);

    return NextResponse.json(inventorySummary);
  } catch (error) {
    console.error('Error fetching inventory summary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inventory summary' },
      { status: 500 }
    );
  }
}
