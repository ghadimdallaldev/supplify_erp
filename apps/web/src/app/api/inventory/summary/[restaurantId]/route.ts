import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { restaurantId: string } }
) {
  try {
    const { restaurantId } = params;

    // Call the real inventory service
    const inventoryServiceUrl = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3005';
    
    const response = await fetch(`${inventoryServiceUrl}/inventory/summary/${restaurantId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Inventory service error:', errorText);
      return NextResponse.json(
        { error: 'Inventory service is not available. Please try again later.' },
        { status: 503 }
      );
    }

    const result = await response.json();

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching inventory summary:', error);
    
    // Handle connection errors gracefully
    if (error instanceof TypeError && error.message.includes('fetch failed')) {
      return NextResponse.json(
        { error: 'Inventory service is not available. Please try again later.' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to fetch inventory summary' },
      { status: 500 }
    );
  }
}