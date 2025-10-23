import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { restaurantId: string } }
) {
  try {
    const { restaurantId } = params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '10');
    
    // Try to call the real inventory service first
    try {
      const inventoryServiceUrl = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3005';
      const response = await fetch(`${inventoryServiceUrl}/inventory/activity/${restaurantId}?limit=${limit}`, {
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
    const recentActivity = inventoryDB.getRecentActivity(restaurantId, limit);

    return NextResponse.json(recentActivity);
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent activity' },
      { status: 500 }
    );
  }
}
