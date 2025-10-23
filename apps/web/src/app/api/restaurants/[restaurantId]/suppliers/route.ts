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
      throw new Error(`Orders service error: ${response.status}`);
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
            // Fallback to basic info if supplier service is not available
            return {
              id: supplierId,
              name: `Supplier ${supplierId}`,
              email: `${supplierId}@supplier.com`,
              isFavorite: false,
            };
          }
        } catch (error) {
          // Fallback to basic info
          return {
            id: supplierId,
            name: `Supplier ${supplierId}`,
            email: `${supplierId}@supplier.com`,
            isFavorite: false,
          };
        }
      })
    );

    return NextResponse.json(suppliers);
  } catch (error: any) {
    console.error('Suppliers API error:', error);
    
    // Return mock data when backend services are not available
    if (error.code === 'ECONNREFUSED' || error.message?.includes('fetch failed')) {
      console.log('Backend services not available, returning mock data');
      return NextResponse.json([
        {
          id: 'supplier-1',
          name: 'Fresh Produce Co.',
          email: 'orders@freshproduce.com',
          isFavorite: false,
        },
        {
          id: 'supplier-2', 
          name: 'Quality Meats Ltd.',
          email: 'sales@qualitymeats.com',
          isFavorite: true,
        },
        {
          id: 'supplier-3',
          name: 'Dairy Direct',
          email: 'contact@dairydirect.com', 
          isFavorite: false,
        }
      ]);
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to fetch suppliers' },
      { status: 500 }
    );
  }
}
