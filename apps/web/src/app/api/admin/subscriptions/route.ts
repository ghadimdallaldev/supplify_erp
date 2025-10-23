import { NextRequest, NextResponse } from 'next/server';

// Mock data for suppliers - in real implementation, this would come from the suppliers service
let suppliers = [
  {
    id: 'sup_1',
    orgName: 'Fresh Foods Co.',
    taxId: 'TAX001',
    kycStatus: 'APPROVED',
    billingPlan: 'FREE',
    promoCredits: 0,
    active: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    description: 'Premium organic produce supplier',
    logoKey: null,
  },
  {
    id: 'sup_2',
    orgName: 'Premium Meats Ltd.',
    taxId: 'TAX002',
    kycStatus: 'APPROVED',
    billingPlan: 'PRO',
    promoCredits: 500,
    active: true,
    createdAt: '2024-01-05T00:00:00Z',
    updatedAt: '2024-01-20T00:00:00Z',
    description: 'High-quality meat and poultry supplier',
    logoKey: null,
  },
  {
    id: 'sup_3',
    orgName: 'Garden Fresh',
    taxId: 'TAX003',
    kycStatus: 'PENDING',
    billingPlan: 'FREE',
    promoCredits: 0,
    active: true,
    createdAt: '2024-01-10T00:00:00Z',
    updatedAt: '2024-01-10T00:00:00Z',
    description: 'Local vegetable and herb supplier',
    logoKey: null,
  },
  {
    id: 'sup_4',
    orgName: 'Gourmet Seafood Inc.',
    taxId: 'TAX004',
    kycStatus: 'APPROVED',
    billingPlan: 'PREMIUM',
    promoCredits: 2000,
    active: true,
    createdAt: '2024-01-15T00:00:00Z',
    updatedAt: '2024-01-25T00:00:00Z',
    description: 'Premium seafood and fish supplier',
    logoKey: null,
  },
  {
    id: 'sup_5',
    orgName: 'Bakery Delights',
    taxId: 'TAX005',
    kycStatus: 'REJECTED',
    billingPlan: 'FREE',
    promoCredits: 0,
    active: false,
    createdAt: '2024-01-20T00:00:00Z',
    updatedAt: '2024-01-22T00:00:00Z',
    description: 'Artisan bakery and pastry supplier',
    logoKey: null,
  },
];

// Mock data for restaurants
let restaurants = [
  {
    id: 'rest_1',
    orgName: 'Golden Fork Restaurant',
    taxId: 'TAX101',
    kycStatus: 'APPROVED',
    billingPlan: 'PRO',
    active: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
    description: 'Fine dining restaurant',
  },
  {
    id: 'rest_2',
    orgName: 'Cafe Bistro',
    taxId: 'TAX102',
    kycStatus: 'APPROVED',
    billingPlan: 'BASIC',
    active: true,
    createdAt: '2024-01-05T00:00:00Z',
    updatedAt: '2024-01-20T00:00:00Z',
    description: 'Casual dining cafe',
  },
  {
    id: 'rest_3',
    orgName: 'Pizza Palace',
    taxId: 'TAX103',
    kycStatus: 'PENDING',
    billingPlan: 'FREE',
    active: true,
    createdAt: '2024-01-10T00:00:00Z',
    updatedAt: '2024-01-10T00:00:00Z',
    description: 'Family pizza restaurant',
  },
];

// Mock subscriptions data
let subscriptions = [
  {
    id: 'sub_1',
    orgId: 'sup_1',
    orgName: 'Fresh Foods Co.',
    orgType: 'SUPPLIER',
    planCode: 'FREE',
    status: 'ACTIVE',
    startsAt: '2024-01-01T00:00:00Z',
    endsAt: null,
    trialEndsAt: null,
    updatedBy: 'admin_1',
  },
  {
    id: 'sub_2',
    orgId: 'sup_2',
    orgName: 'Premium Meats Ltd.',
    orgType: 'SUPPLIER',
    planCode: 'PRO',
    status: 'ACTIVE',
    startsAt: '2024-01-05T00:00:00Z',
    endsAt: null,
    trialEndsAt: '2024-02-05T00:00:00Z',
    updatedBy: 'admin_1',
  },
  {
    id: 'sub_3',
    orgId: 'rest_1',
    orgName: 'Golden Fork Restaurant',
    orgType: 'RESTAURANT',
    planCode: 'PRO',
    status: 'ACTIVE',
    startsAt: '2024-01-01T00:00:00Z',
    endsAt: null,
    trialEndsAt: null,
    updatedBy: 'admin_1',
  },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'suppliers', 'restaurants', 'subscriptions', 'stats'

    switch (type) {
      case 'suppliers':
        return NextResponse.json(suppliers);
      
      case 'restaurants':
        return NextResponse.json(restaurants);
      
      case 'subscriptions':
        const orgType = searchParams.get('orgType');
        const planCode = searchParams.get('planCode');
        
        let filteredSubs = [...subscriptions];
        
        if (orgType) {
          filteredSubs = filteredSubs.filter(sub => sub.orgType === orgType);
        }
        
        if (planCode) {
          filteredSubs = filteredSubs.filter(sub => sub.planCode === planCode);
        }
        
        return NextResponse.json(filteredSubs);
      
      case 'stats':
        const stats = {
          totalSubscriptions: subscriptions.length,
          activeSubscriptions: subscriptions.filter(s => s.status === 'ACTIVE').length,
          byPlan: {
            FREE: subscriptions.filter(s => s.planCode === 'FREE').length,
            BASIC: subscriptions.filter(s => s.planCode === 'BASIC').length,
            PRO: subscriptions.filter(s => s.planCode === 'PRO').length,
            PREMIUM: subscriptions.filter(s => s.planCode === 'PREMIUM').length,
          },
          byOrgType: {
            SUPPLIER: subscriptions.filter(s => s.orgType === 'SUPPLIER').length,
            RESTAURANT: subscriptions.filter(s => s.orgType === 'RESTAURANT').length,
          },
          trialsEndingSoon: subscriptions.filter(s => {
            if (!s.trialEndsAt) return false;
            const trialEnd = new Date(s.trialEndsAt);
            const now = new Date();
            const daysUntilEnd = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return daysUntilEnd <= 7 && daysUntilEnd > 0;
          }).length,
        };
        
        return NextResponse.json(stats);
      
      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error fetching data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data } = body;

    switch (action) {
      case 'assign_subscription':
        const newSubscription = {
          id: `sub_${Date.now()}`,
          orgId: data.orgId,
          orgName: data.orgName,
          orgType: data.orgType,
          planCode: data.planCode,
          status: 'ACTIVE',
          startsAt: new Date().toISOString(),
          endsAt: null,
          trialEndsAt: data.trialDays > 0 ? 
            new Date(Date.now() + data.trialDays * 24 * 60 * 60 * 1000).toISOString() : 
            null,
          updatedBy: 'admin_current',
        };
        
        subscriptions.push(newSubscription);
        
        // Update supplier/restaurant billing plan
        if (data.orgType === 'SUPPLIER') {
          const supplier = suppliers.find(s => s.id === data.orgId);
          if (supplier) {
            supplier.billingPlan = data.planCode;
            supplier.updatedAt = new Date().toISOString();
          }
        } else if (data.orgType === 'RESTAURANT') {
          const restaurant = restaurants.find(r => r.id === data.orgId);
          if (restaurant) {
            restaurant.billingPlan = data.planCode;
            restaurant.updatedAt = new Date().toISOString();
          }
        }
        
        return NextResponse.json(newSubscription);
      
      case 'update_subscription':
        const subIndex = subscriptions.findIndex(s => s.id === data.id);
        if (subIndex === -1) {
          return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
        }
        
        subscriptions[subIndex] = {
          ...subscriptions[subIndex],
          ...data,
          updatedAt: new Date().toISOString(),
          updatedBy: 'admin_current',
        };
        
        return NextResponse.json(subscriptions[subIndex]);
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

// Export data for other modules
// export { suppliers, restaurants, subscriptions };
