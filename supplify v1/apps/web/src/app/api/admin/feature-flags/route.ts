import { NextRequest, NextResponse } from 'next/server';

// This will connect to the actual database service
// For now, we'll create a proper API that can be connected to the database service

// Mock data - in production this will come from the database service
const featureFlags = [
  {
    id: 'flag_1',
    key: 'catalog',
    name: 'Product Catalog',
    description: 'Enable product browsing, supplier products, quick add, bulk upload',
    enabledByDefault: true,
    dependencies: [],
    tags: ['core', 'essential'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'flag_2',
    key: 'orders_realtime',
    name: 'Real-time Orders',
    description: 'Order acknowledgments, preparing, dispatch, delivered timeline + notifications',
    enabledByDefault: false,
    dependencies: ['catalog'],
    tags: ['orders', 'realtime'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'flag_3',
    key: 'chat_enabled',
    name: 'Order Chat System',
    description: 'Order-scoped chat/messaging between restaurants and suppliers',
    enabledByDefault: true,
    dependencies: ['orders_realtime'],
    tags: ['chat', 'communication'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'flag_4',
    key: 'promosuite',
    name: 'PromoSuite Extended',
    description: 'Advanced promotions system with Sponsored Visibility, Discount, Featured Product',
    enabledByDefault: false,
    dependencies: ['promotions_basic'],
    tags: ['promotions', 'advanced'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
  },
  {
    id: 'flag_5',
    key: 'feature_flags_admin',
    name: 'Feature Flags Admin',
    description: 'Access to the feature flags management UI',
    enabledByDefault: true,
    dependencies: [],
    tags: ['admin', 'flags'],
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-15T00:00:00Z',
  },
];

const organizations = [
  { id: 'org_1', name: 'Fresh Foods Co.', type: 'SUPPLIER', tier: 'PRO' },
  { id: 'org_2', name: 'Metro Restaurant', type: 'RESTAURANT', tier: 'BASIC' },
  { id: 'org_3', name: 'Green Valley Suppliers', type: 'SUPPLIER', tier: 'PREMIUM' },
  { id: 'org_4', name: 'Downtown Bistro', type: 'RESTAURANT', tier: 'FREE' },
  { id: 'org_5', name: 'Organic Farms Ltd', type: 'SUPPLIER', tier: 'PRO' },
  { id: 'org_6', name: 'Cafe Central', type: 'RESTAURANT', tier: 'BASIC' },
  { id: 'org_7', name: 'Premium Meats Inc', type: 'SUPPLIER', tier: 'PREMIUM' },
  { id: 'org_8', name: 'Fine Dining Restaurant', type: 'RESTAURANT', tier: 'PRO' },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const flagKey = searchParams.get('flagKey');
    const environment = searchParams.get('environment') || 'dev';

    // TODO: Replace with actual database service calls
    // For now, return mock data but structure it properly for database integration
    
    switch (type) {
      case 'flags':
        // This should call: await flagsService.getAllFlags()
        return NextResponse.json(featureFlags);
      
      case 'organizations':
        // This should call: await flagsService.getAllOrganizations()
        return NextResponse.json(organizations);
      
      case 'rules':
        const flagId = searchParams.get('flagId');
        // This should call: await flagsService.getRulesByFlag(flagId, environment)
        return NextResponse.json([]);
      
      case 'overrides':
        const flagIdForOverrides = searchParams.get('flagId');
        // This should call: await flagsService.getOverridesByFlag(flagIdForOverrides, environment)
        return NextResponse.json([]);
      
      case 'evaluate':
        if (!flagKey) {
          return NextResponse.json({ error: 'flagKey is required' }, { status: 400 });
        }
        
        const orgType = searchParams.get('orgType');
        const orgId = searchParams.get('orgId');
        const userId = searchParams.get('userId');
        
        // This should call: await flagsService.evaluateFlag(flagKey, environment, { orgType, orgId, userId })
        return NextResponse.json({ on: false, reason: 'default' });
      
      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error fetching feature flags data:', error);
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

    console.log('POST request - action:', action, 'data:', data);
    console.log('featureFlags length:', featureFlags.length);

    switch (action) {
      case 'create_flag':
        // This should call: await flagsService.createFlag(data)
        const newFlag = {
          id: `flag_${Date.now()}`,
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        featureFlags.push(newFlag);
        return NextResponse.json(newFlag);
      
      case 'update_flag':
        // Update the flag in the array
        const flagToUpdate = featureFlags.find(f => f.id === data.id);
        if (!flagToUpdate) {
          return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
        }
        
        const updatedFlag = {
          ...flagToUpdate,
          ...data,
          updatedAt: new Date().toISOString(),
        };
        
        // Update in the array
        const updateIndex = featureFlags.findIndex(f => f.id === data.id);
        featureFlags[updateIndex] = updatedFlag;
        
        return NextResponse.json(updatedFlag);
      
      case 'toggle_flag':
        // Toggle the enabledByDefault status
        const flagToToggle = featureFlags.find(f => f.id === data.id);
        if (!flagToToggle) {
          return NextResponse.json({ error: 'Flag not found' }, { status: 404 });
        }
        
        const toggledFlag = {
          ...flagToToggle,
          enabledByDefault: !flagToToggle.enabledByDefault,
          updatedAt: new Date().toISOString(),
        };
        
        // Update in the array
        const flagIndex = featureFlags.findIndex(f => f.id === data.id);
        featureFlags[flagIndex] = toggledFlag;
        
        return NextResponse.json(toggledFlag);
      
      case 'delete_flag':
        // This should call: await flagsService.deleteFlag(data.id)
        return NextResponse.json({ success: true });
      
      case 'create_rule':
        // This should call: await flagsService.createRule(data)
        const newRule = {
          id: `rule_${Date.now()}`,
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        return NextResponse.json(newRule);
      
      case 'update_rule':
        // This should call: await flagsService.updateRule(data.id, data)
        return NextResponse.json({ success: true });
      
      case 'delete_rule':
        // This should call: await flagsService.deleteRule(data.id)
        return NextResponse.json({ success: true });
      
      case 'create_override':
        // This should call: await flagsService.createOverride(data)
        const newOverride = {
          id: `override_${Date.now()}`,
          ...data,
          createdAt: new Date().toISOString(),
        };
        return NextResponse.json(newOverride);
      
      case 'update_override':
        // This should call: await flagsService.updateOverride(data.id, data)
        return NextResponse.json({ success: true });
      
      case 'delete_override':
        // This should call: await flagsService.deleteOverride(data.id)
        return NextResponse.json({ success: true });
      
      case 'invalidate_cache':
        // Mock cache invalidation
        console.log(`Invalidating cache for flag: ${data.flagKey}`);
        return NextResponse.json({ success: true });
      
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error processing feature flags request:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}