import { RedisService } from '@nestjs-modules/ioredis';
import { TenantContext } from '@supplify/utils';
export declare class TenantAwareCacheService {
    private redis;
    constructor(redis: RedisService);
    private tenantContext?;
    setTenantContext(context: TenantContext): void;
    private getClientId;
    private getTenantKey;
    get<T>(key: string): Promise<T | null>;
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;
    del(key: string): Promise<void>;
    exists(key: string): Promise<boolean>;
    expire(key: string, ttlSeconds: number): Promise<void>;
    getKeys(pattern: string): Promise<string[]>;
    delPattern(pattern: string): Promise<number>;
    hget(hashKey: string, field: string): Promise<string | null>;
    hset(hashKey: string, field: string, value: string): Promise<void>;
    hgetall(hashKey: string): Promise<Record<string, string>>;
    hdel(hashKey: string, field: string): Promise<void>;
    lpush(listKey: string, ...values: string[]): Promise<void>;
    rpop(listKey: string): Promise<string | null>;
    llen(listKey: string): Promise<number>;
    sadd(setKey: string, ...members: string[]): Promise<void>;
    srem(setKey: string, ...members: string[]): Promise<void>;
    smembers(setKey: string): Promise<string[]>;
    checkRateLimit(key: string, limit: number, windowSeconds: number): Promise<{
        allowed: boolean;
        remaining: number;
        resetTime: number;
    }>;
    cacheFeatureFlag(flagKey: string, value: any, ttlSeconds?: number): Promise<void>;
    getCachedFeatureFlag(flagKey: string): Promise<any>;
    invalidateFeatureFlag(flagKey: string): Promise<void>;
    cacheProduct(productId: string, product: any, ttlSeconds?: number): Promise<void>;
    getCachedProduct(productId: string): Promise<any>;
    invalidateProduct(productId: string): Promise<void>;
    cacheOrder(orderId: string, order: any, ttlSeconds?: number): Promise<void>;
    getCachedOrder(orderId: string): Promise<any>;
    invalidateOrder(orderId: string): Promise<void>;
    cacheCampaign(campaignId: string, campaign: any, ttlSeconds?: number): Promise<void>;
    getCachedCampaign(campaignId: string): Promise<any>;
    invalidateCampaign(campaignId: string): Promise<void>;
    cacheSession(sessionId: string, session: any, ttlSeconds?: number): Promise<void>;
    getCachedSession(sessionId: string): Promise<any>;
    invalidateSession(sessionId: string): Promise<void>;
    clearTenantData(): Promise<void>;
    getTenantStats(): Promise<{
        keyCount: number;
        memoryUsage: number;
    }>;
}
//# sourceMappingURL=tenant-cache.d.ts.map