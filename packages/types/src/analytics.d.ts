export interface SpendBySupplier {
    supplierId: string;
    supplierName: string;
    totalSpend: number;
    orderCount: number;
    period: string;
}
export interface TopItem {
    productId: string;
    productName: string;
    quantity: number;
    totalSpend: number;
    period: string;
}
export interface TopBuyer {
    restaurantId: string;
    restaurantName: string;
    totalSpend: number;
    orderCount: number;
    period: string;
}
export interface PriceEvolution {
    productId: string;
    month: string;
    avgPrice: number;
    minPrice: number;
    maxPrice: number;
}
export interface RestaurantAnalytics {
    spendBySupplier: SpendBySupplier[];
    topItems: TopItem[];
    totalSpend: number;
    orderCount: number;
}
export interface SupplierAnalytics {
    topBuyers: TopBuyer[];
    topProducts: TopItem[];
    totalRevenue: number;
    orderCount: number;
}
//# sourceMappingURL=analytics.d.ts.map