export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description?: string;
  enabledByDefault: boolean;
  dependencies: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FlagRule {
  id: string;
  flagId: string;
  environment: string;
  status: 'OFF' | 'ON' | 'ROLLOUT';
  rolloutPct: number;
  targetOrgType?: 'SUPPLIER' | 'RESTAURANT';
  targetOrgIds: string[];
  conditions?: any;
  priority: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FlagOverride {
  id: string;
  flagId: string;
  environment: string;
  orgType?: 'SUPPLIER' | 'RESTAURANT';
  orgId?: string;
  userId?: string;
  forcedStatus: 'FORCE_ON' | 'FORCE_OFF';
  note?: string;
  createdBy?: string;
  createdAt: string;
}

export interface FlagEvaluationResult {
  on: boolean;
  reason?: string;
  ruleId?: string;
  rolloutBucket?: number;
}

export interface FlagContext {
  env: 'dev' | 'staging' | 'prod';
  orgType?: 'SUPPLIER' | 'RESTAURANT';
  orgId?: string;
  userId?: string;
}

export interface CreateFlagRuleInput {
  flagId: string;
  environment: string;
  status: 'OFF' | 'ON' | 'ROLLOUT';
  rolloutPct?: number;
  targetOrgType?: 'SUPPLIER' | 'RESTAURANT';
  targetOrgIds?: string[];
  priority?: number;
}

export interface CreateFlagOverrideInput {
  flagId: string;
  environment: string;
  orgType?: 'SUPPLIER' | 'RESTAURANT';
  orgId?: string;
  userId?: string;
  forcedStatus: 'FORCE_ON' | 'FORCE_OFF';
  note?: string;
}
