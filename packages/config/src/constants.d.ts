export declare const SUPPORTED_LOCALES: readonly ["en", "ar"];
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export declare const DEFAULT_LOCALE: Locale;
export declare const CURRENCIES: readonly ["USD", "EUR", "AED"];
export type Currency = (typeof CURRENCIES)[number];
export declare const DEFAULT_CURRENCY: Currency;
export declare const UNITS: readonly ["kg", "g", "l", "ml", "piece", "box", "pack"];
export type Unit = (typeof UNITS)[number];
export declare const LOYALTY_TIERS: {
    readonly BRONZE: {
        readonly minPoints: 0;
        readonly multiplier: 1;
        readonly name: "Bronze";
    };
    readonly SILVER: {
        readonly minPoints: 1000;
        readonly multiplier: 1.2;
        readonly name: "Silver";
    };
    readonly GOLD: {
        readonly minPoints: 5000;
        readonly multiplier: 1.5;
        readonly name: "Gold";
    };
};
export declare const ORDER_STATUSES: readonly ["DRAFT", "SUBMITTED", "CONFIRMED", "PREPARING", "OUT_FOR_DELIVERY", "DELIVERED", "INVOICED", "CANCELLED"];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export declare const USER_ROLES: readonly ["RESTAURANT", "SUPPLIER", "ADMIN"];
export type UserRole = (typeof USER_ROLES)[number];
//# sourceMappingURL=constants.d.ts.map