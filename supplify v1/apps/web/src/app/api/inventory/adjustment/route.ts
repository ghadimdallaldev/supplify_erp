import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, locationId, restaurantId, adjustment, reason, userId } = body;

    // Validate required fields
    if (!itemId || !locationId || !restaurantId || adjustment === undefined || !reason || !userId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Call the real inventory service
    const inventoryServiceUrl = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3005';
    
    const response = await fetch(`${inventoryServiceUrl}/inventory/adjustment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        itemId,
        locationId,
        restaurantId,
        adjustment,
        reason,
        userId,
      }),
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

    return NextResponse.json({
      success: true,
      message: 'Adjustment created successfully',
      adjustmentId: result.id,
    });
  } catch (error) {
    console.error('Error creating inventory adjustment:', error);
    
    // Handle connection errors gracefully
    if (error instanceof TypeError && error.message.includes('fetch failed')) {
      return NextResponse.json(
        { error: 'Inventory service is not available. Please try again later.' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: 'Failed to create inventory adjustment' },
      { status: 500 }
    );
  }
}
