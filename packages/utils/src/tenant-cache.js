"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TenantAwareCacheService = void 0;
const common_1 = require("@nestjs/common");
const ioredis_1 = require("@nestjs-modules/ioredis");
let TenantAwareCacheService = class TenantAwareCacheService {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    tenantContext;
    setTenantContext(context) {
        this.tenantContext = context;
    }
    getClientId() {
        if (!this.tenantContext?.clientId) {
            throw new Error('Tenant context not set. Call setTenantContext() first.');
        }
        return this.tenantContext.clientId;
    }
    // Generate tenant-scoped cache key
    getTenantKey(key) {
        return `t:${this.getClientId()}:${key}`;
    }
    // Cache operations with tenant scoping
    async get(key) {
        const tenantKey = this.getTenantKey(key);
        const value = await this.redis.get(tenantKey);
        return value ? JSON.parse(value) : null;
    }
    async set(key, value, ttlSeconds) {
        const tenantKey = this.getTenantKey(key);
        const serialized = JSON.stringify(value);
        if (ttlSeconds) {
            await this.redis.setex(tenantKey, ttlSeconds, serialized);
        }
        else {
            await this.redis.set(tenantKey, serialized);
        }
    }
    async del(key) {
        const tenantKey = this.getTenantKey(key);
        await this.redis.del(tenantKey);
    }
    async exists(key) {
        const tenantKey = this.getTenantKey(key);
        const result = await this.redis.exists(tenantKey);
        return result === 1;
    }
    async expire(key, ttlSeconds) {
        const tenantKey = this.getTenantKey(key);
        await this.redis.expire(tenantKey, ttlSeconds);
    }
    // Pattern-based operations (for tenant-scoped cleanup)
    async getKeys(pattern) {
        const tenantPattern = `t:${this.getClientId()}:${pattern}`;
        return this.redis.keys(tenantPattern);
    }
    async delPattern(pattern) {
        const tenantPattern = `t:${this.getClientId()}:${pattern}`;
        const keys = await this.redis.keys(tenantPattern);
        if (keys.length === 0)
            return 0;
        return this.redis.del(...keys);
    }
    // Hash operations
    async hget(hashKey, field) {
        const tenantHashKey = this.getTenantKey(hashKey);
        return this.redis.hget(tenantHashKey, field);
    }
    async hset(hashKey, field, value) {
        const tenantHashKey = this.getTenantKey(hashKey);
        await this.redis.hset(tenantHashKey, field, value);
    }
    async hgetall(hashKey) {
        const tenantHashKey = this.getTenantKey(hashKey);
        return this.redis.hgetall(tenantHashKey);
    }
    async hdel(hashKey, field) {
        const tenantHashKey = this.getTenantKey(hashKey);
        await this.redis.hdel(tenantHashKey, field);
    }
    // List operations
    async lpush(listKey, ...values) {
        const tenantListKey = this.getTenantKey(listKey);
        await this.redis.lpush(tenantListKey, ...values);
    }
    async rpop(listKey) {
        const tenantListKey = this.getTenantKey(listKey);
        return this.redis.rpop(tenantListKey);
    }
    async llen(listKey) {
        const tenantListKey = this.getTenantKey(listKey);
        return this.redis.llen(tenantListKey);
    }
    // Set operations
    async sadd(setKey, ...members) {
        const tenantSetKey = this.getTenantKey(setKey);
        await this.redis.sadd(tenantSetKey, ...members);
    }
    async srem(setKey, ...members) {
        const tenantSetKey = this.getTenantKey(setKey);
        await this.redis.srem(tenantSetKey, ...members);
    }
    async smembers(setKey) {
        const tenantSetKey = this.getTenantKey(setKey);
        return this.redis.smembers(tenantSetKey);
    }
    // Rate limiting per tenant
    async checkRateLimit(key, limit, windowSeconds) {
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
        }
        else {
            await this.redis.incr(tenantKey);
        }
        return {
            allowed: true,
            remaining: limit - count - 1,
            resetTime: Date.now() + (windowSeconds * 1000),
        };
    }
    // Feature flag caching
    async cacheFeatureFlag(flagKey, value, ttlSeconds = 300) {
        await this.set(`flags:${flagKey}`, value, ttlSeconds);
    }
    async getCachedFeatureFlag(flagKey) {
        return this.get(`flags:${flagKey}`);
    }
    async invalidateFeatureFlag(flagKey) {
        await this.del(`flags:${flagKey}`);
    }
    // Product caching
    async cacheProduct(productId, product, ttlSeconds = 600) {
        await this.set(`products:${productId}`, product, ttlSeconds);
    }
    async getCachedProduct(productId) {
        return this.get(`products:${productId}`);
    }
    async invalidateProduct(productId) {
        await this.del(`products:${productId}`);
    }
    // Order caching
    async cacheOrder(orderId, order, ttlSeconds = 300) {
        await this.set(`orders:${orderId}`, order, ttlSeconds);
    }
    async getCachedOrder(orderId) {
        return this.get(`orders:${orderId}`);
    }
    async invalidateOrder(orderId) {
        await this.del(`orders:${orderId}`);
    }
    // Campaign caching
    async cacheCampaign(campaignId, campaign, ttlSeconds = 600) {
        await this.set(`campaigns:${campaignId}`, campaign, ttlSeconds);
    }
    async getCachedCampaign(campaignId) {
        return this.get(`campaigns:${campaignId}`);
    }
    async invalidateCampaign(campaignId) {
        await this.del(`campaigns:${campaignId}`);
    }
    // Session caching
    async cacheSession(sessionId, session, ttlSeconds = 3600) {
        await this.set(`sessions:${sessionId}`, session, ttlSeconds);
    }
    async getCachedSession(sessionId) {
        return this.get(`sessions:${sessionId}`);
    }
    async invalidateSession(sessionId) {
        await this.del(`sessions:${sessionId}`);
    }
    // Clear all tenant data (for tenant deletion)
    async clearTenantData() {
        const pattern = `t:${this.getClientId()}:*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
            await this.redis.del(...keys);
        }
    }
    // Get tenant cache statistics
    async getTenantStats() {
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
};
exports.TenantAwareCacheService = TenantAwareCacheService;
exports.TenantAwareCacheService = TenantAwareCacheService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [typeof (_a = typeof ioredis_1.RedisService !== "undefined" && ioredis_1.RedisService) === "function" ? _a : Object])
], TenantAwareCacheService);
//# sourceMappingURL=tenant-cache.js.map