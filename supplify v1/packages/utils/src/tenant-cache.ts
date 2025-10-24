import { Injectable } from '@nestjs/common';
import { RedisService } from '@nestjs-modules/ioredis';
import { TenantContext } from '@supplify/utils';

@Injectable()
export class TenantAwareCacheService {
  constructor(private redis: RedisService) {}

  private tenantContext?: TenantContext;

  setTenantContext(context: TenantContext) {
    this.tenantContext = context;
  }

  private getClientId(): string {
    if (!this.tenantContext?.clientId) {
      throw new Error('Tenant context not set. Call setTenantContext() first.');
    }
    return this.tenantContext.clientId;
  }

  // Generate tenant-scoped cache key
  private getTenantKey(key: string): string {
    return `t:${this.getClientId()}:${key}`;
  }

  // Cache operations with tenant scoping
  async get<T>(key: string): Promise<T | null> {
    const tenantKey = this.getTenantKey(key);
    const value = await this.redis.get(tenantKey);
    return value ? JSON.parse(value) : null;
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<void> {
    const tenantKey = this.getTenantKey(key);
    const serialized = JSON.stringify(value);
    
    if (ttlSeconds) {
      await this.redis.setex(tenantKey, ttlSeconds, serialized);
    } else {
      await this.redis.set(tenantKey, serialized);
    }
  }

  async del(key: string): Promise<void> {
    const tenantKey = this.getTenantKey(key);
    await this.redis.del(tenantKey);
  }

  async exists(key: string): Promise<boolean> {
    const tenantKey = this.getTenantKey(key);
    const result = await this.redis.exists(tenantKey);
    return result === 1;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    const tenantKey = this.getTenantKey(key);
    await this.redis.expire(tenantKey, ttlSeconds);
  }

  // Pattern-based operations (for tenant-scoped cleanup)
  async getKeys(pattern: string): Promise<string[]> {
    const tenantPattern = `t:${this.getClientId()}:${pattern}`;
    return this.redis.keys(tenantPattern);
  }

  async delPattern(pattern: string): Promise<number> {
    const tenantPattern = `t:${this.getClientId()}:${pattern}`;
    const keys = await this.redis.keys(tenantPattern);
    if (keys.length === 0) return 0;
    return this.redis.del(...keys);
  }

  // Hash operations
  async hget(hashKey: string, field: string): Promise<string | null> {
    const tenantHashKey = this.getTenantKey(hashKey);
    return this.redis.hget(tenantHashKey, field);
  }

  async hset(hashKey: string, field: string, value: string): Promise<void> {
    const tenantHashKey = this.getTenantKey(hashKey);
    await this.redis.hset(tenantHashKey, field, value);
  }

  async hgetall(hashKey: string): Promise<Record<string, string>> {
    const tenantHashKey = this.getTenantKey(hashKey);
    return this.redis.hgetall(tenantHashKey);
  }

  async hdel(hashKey: string, field: string): Promise<void> {
    const tenantHashKey = this.getTenantKey(hashKey);
    await this.redis.hdel(tenantHashKey, field);
  }

  // List operations
  async lpush(listKey: string, ...values: string[]): Promise<void> {
    const tenantListKey = this.getTenantKey(listKey);
    await this.redis.lpush(tenantListKey, ...values);
  }

  async rpop(listKey: string): Promise<string | null> {
    const tenantListKey = this.getTenantKey(listKey);
    return this.redis.rpop(tenantListKey);
  }

  async llen(listKey: string): Promise<number> {
    const tenantListKey = this.getTenantKey(listKey);
    return this.redis.llen(tenantListKey);
  }

  // Set operations
  async sadd(setKey: string, ...members: string[]): Promise<void> {
    const tenantSetKey = this.getTenantKey(setKey);
    await this.redis.sadd(tenantSetKey, ...members);
  }

  async srem(setKey: string, ...members: string[]): Promise<void> {
    const tenantSetKey = this.getTenantKey(setKey);
    await this.redis.srem(tenantSetKey, ...members);
  }

  async smembers(setKey: string): Promise<string[]> {
    const tenantSetKey = this.getTenantKey(setKey);
    return this.redis.smembers(tenantSetKey);
  }

  // Rate limiting per tenant
  async checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const tenantKey = this.getTenantKey(`ratelimit:${key}`);
    const current = await this.redis.get(tenantKey);
    const count = current ? parseInt(current) : 0;

    if (count >= limit) {
      const ttl = await this.redis.ttl(tenantKey);
      return {
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + (ttl * 1000),
      };
    }

    if (count === 0) {
      await this.redis.setex(tenantKey, windowSeconds, '1');
    } else {
      await this.redis.incr(tenantKey);
    }

    return {
      allowed: true,
      remaining: limit - count - 1,
      resetTime: Date.now() + (windowSeconds * 1000),
    };
  }

  // Feature flag caching
  async cacheFeatureFlag(flagKey: string, value: any, ttlSeconds: number = 300): Promise<void> {
    await this.set(`flags:${flagKey}`, value, ttlSeconds);
  }

  async getCachedFeatureFlag(flagKey: string): Promise<any> {
    return this.get(`flags:${flagKey}`);
  }

  async invalidateFeatureFlag(flagKey: string): Promise<void> {
    await this.del(`flags:${flagKey}`);
  }

  // Product caching
  async cacheProduct(productId: string, product: any, ttlSeconds: number = 600): Promise<void> {
    await this.set(`products:${productId}`, product, ttlSeconds);
  }

  async getCachedProduct(productId: string): Promise<any> {
    return this.get(`products:${productId}`);
  }

  async invalidateProduct(productId: string): Promise<void> {
    await this.del(`products:${productId}`);
  }

  // Order caching
  async cacheOrder(orderId: string, order: any, ttlSeconds: number = 300): Promise<void> {
    await this.set(`orders:${orderId}`, order, ttlSeconds);
  }

  async getCachedOrder(orderId: string): Promise<any> {
    return this.get(`orders:${orderId}`);
  }

  async invalidateOrder(orderId: string): Promise<void> {
    await this.del(`orders:${orderId}`);
  }

  // Campaign caching
  async cacheCampaign(campaignId: string, campaign: any, ttlSeconds: number = 600): Promise<void> {
    await this.set(`campaigns:${campaignId}`, campaign, ttlSeconds);
  }

  async getCachedCampaign(campaignId: string): Promise<any> {
    return this.get(`campaigns:${campaignId}`);
  }

  async invalidateCampaign(campaignId: string): Promise<void> {
    await this.del(`campaigns:${campaignId}`);
  }

  // Session caching
  async cacheSession(sessionId: string, session: any, ttlSeconds: number = 3600): Promise<void> {
    await this.set(`sessions:${sessionId}`, session, ttlSeconds);
  }

  async getCachedSession(sessionId: string): Promise<any> {
    return this.get(`sessions:${sessionId}`);
  }

  async invalidateSession(sessionId: string): Promise<void> {
    await this.del(`sessions:${sessionId}`);
  }

  // Clear all tenant data (for tenant deletion)
  async clearTenantData(): Promise<void> {
    const pattern = `t:${this.getClientId()}:*`;
    const keys = await this.redis.keys(pattern);
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  // Get tenant cache statistics
  async getTenantStats(): Promise<{ keyCount: number; memoryUsage: number }> {
    const pattern = `t:${this.getClientId()}:*`;
    const keys = await this.redis.keys(pattern);
    
    let memoryUsage = 0;
    for (const key of keys) {
      const size = await this.redis.memory('usage', key);
      memoryUsage += parseInt(size);
    }

    return {
      keyCount: keys.length,
      memoryUsage,
    };
  }
}
