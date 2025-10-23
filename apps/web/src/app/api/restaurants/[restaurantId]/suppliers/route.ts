import { NextRequest, NextResponse } from 'next/server';

const ORDERS_SERVICE_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3002';

// Get suppliers that a restaurant has ordered from
export async function GET(
  request: NextRequest,
  { params }: { params: { restaurantId: string } }
) {
  try {
    const { restaurantId } = params;

    // Get orders for this restaurant to find suppliers
    const response = await fetch(`${ORDERS_SERVICE_URL}/orders?restaurantId=${restaurantId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Orders service is not available. Please try again later.' },
        { status: 503 }
      );
    }

    const orders = await response.json();
    
    // Extract unique suppliers from orders
    const supplierIds: string[] = [...new Set(orders.map((order: any) => order.supplierId))] as string[];
    
    // Get supplier details (this would ideally come from a suppliers service)
    const suppliers = await Promise.all(
      supplierIds.map(async (supplierId: string) => {
        try {
          const supplierResponse = await fetch(`${ORDERS_SERVICE_URL}/suppliers/${supplierId}`, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          if (supplierResponse.ok) {
            return await supplierResponse.json();
          } else {
            throw new Error(`Supplier service error: ${supplierResponse.status}`);
          }
        } catch (error) {
          throw error;
        }
      })
    );

    return NextResponse.json(suppliers);
  } catch (error: any) {
    console.error('Suppliers API error:', error);
    
    // Handle connection errors gracefully
    if (error.code === 'ECONNREFUSED' || error.message?.includes('fetch failed')) {
      return NextResponse.json(
        { error: 'Backend services are not available. Please try again later.' },
        { status: 503 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch suppliers' },
      { status: 500 }
    );
  }
}
