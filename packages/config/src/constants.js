"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACTOR_TYPES = exports.ORDER_EVENT_TYPES = exports.SLA_CONFIG = exports.USER_ROLES = exports.ORDER_STATUSES = exports.LOYALTY_TIERS = exports.UNITS = exports.DEFAULT_CURRENCY = exports.CURRENCIES = exports.DEFAULT_LOCALE = exports.SUPPORTED_LOCALES = void 0;
exports.SUPPORTED_LOCALES = ['en', 'ar'];
exports.DEFAULT_LOCALE = 'en';
exports.CURRENCIES = ['USD', 'EUR', 'AED'];
exports.DEFAULT_CURRENCY = 'USD';
exports.UNITS = ['kg', 'g', 'l', 'ml', 'piece', 'box', 'pack'];
exports.LOYALTY_TIERS = {
    BRONZE: { minPoints: 0, multiplier: 1.0, name: 'Bronze' },
    SILVER: { minPoints: 1000, multiplier: 1.2, name: 'Silver' },
    GOLD: { minPoints: 5000, multiplier: 1.5, name: 'Gold' },
};
exports.ORDER_STATUSES = [
    'PLACED',
    'ACKNOWLEDGED',
    'PREPARING',
    'DISPATCHED',
    'DELIVERED',
    'CANCELLED',
];
exports.USER_ROLES = ['RESTAURANT', 'SUPPLIER', 'ADMIN'];
// SLA Configuration (in minutes)
exports.SLA_CONFIG = {
    ACKNOWLEDGEMENT_TIMEOUT: 30, // 30 minutes to acknowledge
    PREPARATION_TIMEOUT: 120, // 2 hours to start preparing
    DISPATCH_TIMEOUT: 240, // 4 hours to dispatch
};
// Order Event Types
exports.ORDER_EVENT_TYPES = [
    'PLACED',
    'ACKNOWLEDGED',
    'PREPARING',
    'DISPATCHED',
    'DELIVERED',
    'CANCELLED',
    'ETA_UPDATED',
    'NOTE_ADDED',
];
// Actor Types
exports.ACTOR_TYPES = [
    'SYSTEM',
    'SUPPLIER',
    'RESTAURANT',
    'ADMIN',
];
//# sourceMappingURL=constants.js.map