import type { Address } from './common';
export interface Restaurant {
    id: string;
    orgName: string;
    cuisine?: string;
    addresses: Address[];
    deliveryWindow?: string;
    preferredSuppliers: string[];
    favoriteProducts: string[];
    logoKey?: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface Favorite {
    id: string;
    restaurantId: string;
    productId: string;
    createdAt: Date;
}
//# sourceMappingURL=restaurant.d.ts.map