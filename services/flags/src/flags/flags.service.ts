import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '@supplify/database';
import { CreateFlagDto, UpdateFlagDto, CreateRuleDto, CreateOverrideDto } from './dto/flags.dto';

@Injectable()
export class FlagsService {
  private readonly logger = new Logger(FlagsService.name);

  constructor(private db: DatabaseService) {}

  // Feature Flags CRUD
  async getAllFlags() {
    return this.db.featureFlag.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async getFlagById(id: string) {
    return this.db.featureFlag.findUnique({
      where: { id },
      include: {
        rules: true,
        overrides: true,
      },
    });
  }

  async getFlagByKey(key: string) {
    return this.db.featureFlag.findUnique({
      where: { key },
      include: {
        rules: true,
        overrides: true,
      },
    });
  }

  async createFlag(dto: CreateFlagDto) {
    return this.db.featureFlag.create({
      data: dto,
    });
  }

  async updateFlag(id: string, dto: UpdateFlagDto) {
    return this.db.featureFlag.update({
      where: { id },
      data: dto,
    });
  }

  async deleteFlag(id: string) {
    // Delete related rules and overrides first
    await this.db.flagRule.deleteMany({
      where: { flagId: id },
    });
    
    await this.db.flagOverride.deleteMany({
      where: { flagId: id },
    });

    return this.db.featureFlag.delete({
      where: { id },
    });
  }

  // Flag Rules CRUD
  async getRulesByFlag(flagId: string, environment: string = 'dev') {
    return this.db.flagRule.findMany({
      where: {
        flagId,
        environment,
      },
      orderBy: { priority: 'desc' },
    });
  }

  async createRule(dto: CreateRuleDto) {
    return this.db.flagRule.create({
      data: dto,
    });
  }

  async updateRule(id: string, dto: Partial<CreateRuleDto>) {
    return this.db.flagRule.update({
      where: { id },
      data: dto,
    });
  }

  async deleteRule(id: string) {
    return this.db.flagRule.delete({
      where: { id },
    });
  }

  // Flag Overrides CRUD
  async getOverridesByFlag(flagId: string, environment: string = 'dev') {
    return this.db.flagOverride.findMany({
      where: {
        flagId,
        environment,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createOverride(dto: CreateOverrideDto) {
    return this.db.flagOverride.create({
      data: dto,
    });
  }

  async updateOverride(id: string, dto: Partial<CreateOverrideDto>) {
    return this.db.flagOverride.update({
      where: { id },
      data: dto,
    });
  }

  async deleteOverride(id: string) {
    return this.db.flagOverride.delete({
      where: { id },
    });
  }

  // Organizations
  async getAllOrganizations() {
    return this.db.organization.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
    });
  }

  // Flag Evaluation
  async evaluateFlag(
    flagKey: string,
    environment: string = 'dev',
    context: {
      orgType?: string;
      orgId?: string;
      userId?: string;
    } = {}
  ) {
    const flag = await this.getFlagByKey(flagKey);
    if (!flag) {
      return { on: false, reason: 'flag_not_found' };
    }

    // Check dependencies
    for (const dep of flag.dependencies) {
      const depResult = await this.evaluateFlag(dep, environment, context);
      if (!depResult.on) {
        return { on: false, reason: `dependency_off:${dep}` };
      }
    }

    // Check overrides (most specific first)
    const override = await this.db.flagOverride.findFirst({
      where: {
        flagId: flag.id,
        environment,
        OR: [
          { userId: context.userId },
          { orgId: context.orgId },
          { orgType: context.orgType },
        ],
      },
      orderBy: [
        { userId: 'desc' }, // User override is most specific
        { orgId: 'desc' },  // Org override is second
        { orgType: 'desc' }, // Org type override is least specific
      ],
    });

    if (override) {
      return {
        on: override.forcedStatus === 'FORCE_ON',
        reason: `override:${override.id}`,
        override,
      };
    }

    // Check rules
    const applicableRules = await this.db.flagRule.findMany({
      where: {
        flagId: flag.id,
        environment,
        OR: [
          { targetOrgType: null }, // Global rule
          { targetOrgType: context.orgType }, // Org type rule
          { targetOrgIds: { has: context.orgId } }, // Specific org rule
        ],
      },
      orderBy: { priority: 'desc' },
    });

    if (applicableRules.length > 0) {
      const rule = applicableRules[0];
      
      if (rule.status === 'ON') {
        return { on: true, reason: 'rule_on', ruleId: rule.id };
      }
      
      if (rule.status === 'OFF') {
        return { on: false, reason: 'rule_off', ruleId: rule.id };
      }
      
      if (rule.status === 'ROLLOUT') {
        // Deterministic rollout based on orgId or userId
        const identifier = context.userId || context.orgId || 'anonymous';
        const bucket = this.hashString(identifier) % 100;
        const isInRollout = bucket < rule.rolloutPct;
        
        return {
          on: isInRollout,
          reason: isInRollout ? 'rollout_hit' : 'rollout_miss',
          ruleId: rule.id,
          rolloutBucket: bucket,
        };
      }
    }

    // Default
    return { on: flag.enabledByDefault, reason: 'default' };
  }

  // Seed initial data
  async seedInitialData() {
    const existingFlags = await this.prisma.featureFlag.count();
    if (existingFlags > 0) {
      this.logger.log('Feature flags already seeded');
      return;
    }

    const initialFlags = [
      {
        key: 'catalog',
        name: 'Product Catalog',
        description: 'Enable product browsing, supplier products, quick add, bulk upload',
        enabledByDefault: true,
        dependencies: [],
        tags: ['core', 'essential'],
      },
      {
        key: 'orders_realtime',
        name: 'Real-time Orders',
        description: 'Order acknowledgments, preparing, dispatch, delivered timeline + notifications',
        enabledByDefault: false,
        dependencies: ['catalog'],
        tags: ['orders', 'realtime'],
      },
      {
        key: 'chat_enabled',
        name: 'Order Chat System',
        description: 'Order-scoped chat/messaging between restaurants and suppliers',
        enabledByDefault: true,
        dependencies: ['orders_realtime'],
        tags: ['chat', 'communication'],
      },
      {
        key: 'promosuite',
        name: 'PromoSuite Extended',
        description: 'Advanced promotions system with Sponsored Visibility, Discount, Featured Product',
        enabledByDefault: false,
        dependencies: ['promotions_basic'],
        tags: ['promotions', 'advanced'],
      },
      {
        key: 'feature_flags_admin',
        name: 'Feature Flags Admin',
        description: 'Access to the feature flags management UI',
        enabledByDefault: true,
        dependencies: [],
        tags: ['admin', 'flags'],
      },
    ];

    for (const flagData of initialFlags) {
      await this.prisma.featureFlag.create({
        data: flagData,
      });
    }

    // Seed organizations
    const existingOrgs = await this.prisma.organization.count();
    if (existingOrgs === 0) {
      const initialOrgs = [
        { name: 'Fresh Foods Co.', type: 'SUPPLIER', tier: 'PRO' },
        { name: 'Premium Meats Ltd.', type: 'SUPPLIER', tier: 'PREMIUM' },
        { name: 'Garden Fresh', type: 'SUPPLIER', tier: 'FREE' },
        { name: 'Golden Fork Restaurant', type: 'RESTAURANT', tier: 'PRO' },
        { name: 'Cafe Bistro', type: 'RESTAURANT', tier: 'BASIC' },
      ];

      for (const orgData of initialOrgs) {
        await this.prisma.organization.create({
          data: orgData,
        });
      }
    }

    this.logger.log('Initial feature flags and organizations seeded');
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}