"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_ROLES = exports.ORDER_STATUSES = exports.LOYALTY_TIERS = exports.UNITS = exports.DEFAULT_CURRENCY = exports.CURRENCIES = exports.DEFAULT_LOCALE = exports.SUPPORTED_LOCALES = void 0;
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
    'DRAFT',
    'SUBMITTED',
    'CONFIRMED',
    'PREPARING',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'INVOICED',
    'CANCELLED',
];
exports.USER_ROLES = ['RESTAURANT', 'SUPPLIER', 'ADMIN'];
//# sourceMappingURL=constants.js.map