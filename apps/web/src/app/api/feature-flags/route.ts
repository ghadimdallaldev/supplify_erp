import { NextRequest, NextResponse } from 'next/server';

// Mock feature flag data (in production, this would come from database)
const featureFlags = [
  {
    id: 'flag_catalog',
    key: 'catalog',
    name: 'Product Catalog',
    description: 'Enable product catalog functionality',
    enabledByDefault: true,
    dependencies: [],
    tags: ['core', 'products'],
  },
  {
    id: 'flag_orders_realtime',
    key: 'orders_realtime',
    name: 'Real-time Orders',
    description: 'Enable real-time order tracking and updates',
    enabledByDefault: false,
    dependencies: [],
    tags: ['orders', 'realtime'],
  },
  {
    id: 'flag_chat_enabled',
    key: 'chat_enabled',
    name: 'Chat System',
    description: 'Enable chat functionality for orders and support',
    enabledByDefault: false,
    dependencies: [],
    tags: ['chat', 'communication'],
  },
  {
    id: 'flag_pinned_products',
    key: 'pinned_products',
    name: 'Pinned Products',
    description: 'Allow restaurants to pin favorite products',
    enabledByDefault: false,
    dependencies: ['catalog'],
    tags: ['products', 'favorites'],
  },
  {
    id: 'flag_inventory_module',
    key: 'inventory_module',
    name: 'Inventory Management',
    description: 'Enable inventory tracking and management',
    enabledByDefault: false,
    dependencies: ['catalog'],
    tags: ['inventory', 'management'],
  },
  {
    id: 'flag_promotions_basic',
    key: 'promotions_basic',
    name: 'Basic Promotions',
    description: 'Enable basic promotion and discount features',
    enabledByDefault: false,
    dependencies: ['catalog'],
    tags: ['promotions', 'discounts'],
  },
  {
    id: 'flag_promosuite',
    key: 'promosuite',
    name: 'PromoSuite',
    description: 'Advanced promotion and advertising suite',
    enabledByDefault: false,
    dependencies: ['promotions_basic'],
    tags: ['promotions', 'advertising'],
  },
  {
    id: 'flag_sponsored_ads',
    key: 'sponsoredAds',
    name: 'Sponsored Ads',
    description: 'Enable sponsored product and supplier visibility',
    enabledByDefault: false,
    dependencies: ['promosuite'],
    tags: ['advertising', 'sponsored'],
  },
  {
    id: 'flag_loyalty_program',
    key: 'loyalty_program',
    name: 'Loyalty Program',
    description: 'Enable customer loyalty and rewards program',
    enabledByDefault: false,
    dependencies: [],
    tags: ['loyalty', 'rewards'],
  },
  {
    id: 'flag_recommendations',
    key: 'recommendations',
    name: 'Product Recommendations',
    description: 'Enable AI-powered product recommendations',
    enabledByDefault: false,
    dependencies: ['catalog'],
    tags: ['ai', 'recommendations'],
  },
  {
    id: 'flag_subscriptions',
    key: 'subscriptions',
    name: 'Subscription Management',
    description: 'Enable subscription and billing management',
    enabledByDefault: false,
    dependencies: [],
    tags: ['subscriptions', 'billing'],
  },
  {
    id: 'flag_analytics_dashboards',
    key: 'analytics_dashboards',
    name: 'Analytics Dashboards',
    description: 'Enable advanced analytics and reporting dashboards',
    enabledByDefault: false,
    dependencies: [],
    tags: ['analytics', 'reporting'],
  },
  {
    id: 'flag_feature_flags_admin',
    key: 'feature_flags_admin',
    name: 'Feature Flags Admin',
    description: 'Enable feature flag administration interface',
    enabledByDefault: true,
    dependencies: [],
    tags: ['admin', 'feature-flags'],
  },
];

const flagRules = [
  {
    id: 'rule_catalog_global',
    flagId: 'flag_catalog',
    clientId: null,
    environment: 'development',
    status: 'ON',
    rolloutPct: 100,
    targetOrgType: null,
    targetOrgIds: [],
    priority: 0,
    conditions: null,
    createdBy: 'system',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
];

const flagOverrides = [];

// Feature flag evaluation logic
function evaluateFlag(
  flagKey: string,
  context: {
    env: string;
    userId?: string;
    orgType?: string;
    clientId?: string;
  }
): {
  flagKey: string;
  enabled: boolean;
  reason: 'default' | 'rule' | 'override' | 'rollout';
  ruleId?: string;
  overrideId?: string;
  rolloutPercentage?: number;
  evaluatedAt: string;
} {
  const flag = featureFlags.find(f => f.key === flagKey);
  if (!flag) {
    throw new Error(`Feature flag '${flagKey}' not found`);
  }

  let evaluation = {
    flagKey,
    enabled: flag.enabledByDefault,
    reason: 'default' as const,
    evaluatedAt: new Date().toISOString(),
  };

  // Check for user-specific override
  if (context.userId) {
    const userOverride = flagOverrides.find(
      o => o.flagId === flag.id && o.userId === context.userId && o.environment === context.env
    );
    if (userOverride) {
      evaluation = {
        flagKey,
        enabled: userOverride.forcedStatus === 'FORCE_ON',
        reason: 'override',
        overrideId: userOverride.id,
        evaluatedAt: new Date().toISOString(),
      };
      return evaluation;
    }
  }

  // Check for org-specific override
  if (context.clientId) {
    const orgOverride = flagOverrides.find(
      o => o.flagId === flag.id && o.orgId === context.clientId && o.environment === context.env
    );
    if (orgOverride) {
      evaluation = {
        flagKey,
        enabled: orgOverride.forcedStatus === 'FORCE_ON',
        reason: 'override',
        overrideId: orgOverride.id,
        evaluatedAt: new Date().toISOString(),
      };
      return evaluation;
    }
  }

  // Check for org-type override
  if (context.orgType) {
    const orgTypeOverride = flagOverrides.find(
      o => o.flagId === flag.id && o.orgType === context.orgType && o.environment === context.env
    );
    if (orgTypeOverride) {
      evaluation = {
        flagKey,
        enabled: orgTypeOverride.forcedStatus === 'FORCE_ON',
        reason: 'override',
        overrideId: orgTypeOverride.id,
        evaluatedAt: new Date().toISOString(),
      };
      return evaluation;
    }
  }

  // Check for rules
  const applicableRules = flagRules.filter(
    r => r.flagId === flag.id && r.environment === context.env
  ).sort((a, b) => b.priority - a.priority);

  for (const rule of applicableRules) {
    // Check if rule applies to this context
    if (rule.clientId && rule.clientId !== context.clientId) continue;
    if (rule.targetOrgType && rule.targetOrgType !== context.orgType) continue;
    if (rule.targetOrgIds.length > 0 && !rule.targetOrgIds.includes(context.clientId || '')) continue;

    if (rule.status === 'ON') {
      evaluation = {
        flagKey,
        enabled: true,
        reason: 'rule',
        ruleId: rule.id,
        evaluatedAt: new Date().toISOString(),
      };
      return evaluation;
    } else if (rule.status === 'OFF') {
      evaluation = {
        flagKey,
        enabled: false,
        reason: 'rule',
        ruleId: rule.id,
        evaluatedAt: new Date().toISOString(),
      };
      return evaluation;
    } else if (rule.status === 'ROLLOUT') {
      const isInRollout = isInRolloutPercentage(context.userId || context.clientId || '', rule.rolloutPct);
      evaluation = {
        flagKey,
        enabled: isInRollout,
        reason: 'rollout',
        ruleId: rule.id,
        rolloutPercentage: rule.rolloutPct,
        evaluatedAt: new Date().toISOString(),
      };
      return evaluation;
    }
  }

  return evaluation;
}

function isInRolloutPercentage(identifier: string, percentage: number): boolean {
  // Deterministic hash-based rollout
  let hash = 0;
  for (let i = 0; i < identifier.length; i++) {
    const char = identifier.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return (Math.abs(hash) % 100) < percentage;
}

// GET /api/feature-flags
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    switch (type) {
      case 'flags':
        return NextResponse.json(featureFlags);
      case 'rules':
        return NextResponse.json(flagRules);
      case 'overrides':
        return NextResponse.json(flagOverrides);
      default:
        return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in feature flags GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/feature-flags
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, data, context } = body;

    switch (action) {
      case 'evaluate':
        const evaluation = evaluateFlag(data.flagKey, context);
        return NextResponse.json(evaluation);

      case 'get_all':
        const allFlags: Record<string, boolean> = {};
        for (const flag of featureFlags) {
          const evaluation = evaluateFlag(flag.key, context);
          allFlags[flag.key] = evaluation.enabled;
        }
        return NextResponse.json(allFlags);

      case 'create_rule':
        const newRule = {
          id: `rule_${Date.now()}`,
          ...data,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        flagRules.push(newRule);
        return NextResponse.json(newRule);

      case 'update_rule':
        const ruleIndex = flagRules.findIndex(r => r.id === data.id);
        if (ruleIndex === -1) {
          return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
        }
        flagRules[ruleIndex] = { ...flagRules[ruleIndex], ...data, updatedAt: new Date().toISOString() };
        return NextResponse.json(flagRules[ruleIndex]);

      case 'delete_rule':
        const ruleDeleteIndex = flagRules.findIndex(r => r.id === data.id);
        if (ruleDeleteIndex === -1) {
          return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
        }
        flagRules.splice(ruleDeleteIndex, 1);
        return NextResponse.json({ success: true });

      case 'create_override':
        const newOverride = {
          id: `override_${Date.now()}`,
          ...data,
          createdAt: new Date().toISOString(),
        };
        flagOverrides.push(newOverride);
        return NextResponse.json(newOverride);

      case 'delete_override':
        const overrideIndex = flagOverrides.findIndex(o => o.id === data.id);
        if (overrideIndex === -1) {
          return NextResponse.json({ error: 'Override not found' }, { status: 404 });
        }
        flagOverrides.splice(overrideIndex, 1);
        return NextResponse.json({ success: true });

      case 'invalidate_cache':
        // In a real implementation, this would invalidate Redis cache
        console.log(`Invalidating cache for flag: ${data.flagKey || 'all'}`);
        return NextResponse.json({ success: true });

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Error in feature flags POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// GET /api/feature-flags/evaluate
// export async function GET_EVALUATE(request: NextRequest) {
//   try {
//     const { searchParams } = new URL(request.url);
//     const flagKey = searchParams.get('flagKey');
//     const contextStr = searchParams.get('context');

//     if (!flagKey || !contextStr) {
//       return NextResponse.json({ error: 'Missing flagKey or context' }, { status: 400 });
//     }

//     const context = JSON.parse(contextStr);
//     const evaluation = evaluateFlag(flagKey, context);

//     return NextResponse.json(evaluation);
//   } catch (error) {
//     console.error('Error in feature flags evaluate:', error);
//     return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
//   }
// }
