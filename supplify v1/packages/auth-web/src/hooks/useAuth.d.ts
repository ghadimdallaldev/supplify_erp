export interface User {
    id: string;
    email: string;
    name?: string;
    image?: string;
    clientId?: string;
    orgType?: string;
    tier?: string;
    roles?: string[];
}
export interface Session {
    user: User;
    accessToken?: string;
    refreshToken?: string;
    expires: string;
}
export declare function useAuth(): {
    user: {
        name?: string | null;
        email?: string | null;
        image?: string | null;
    };
    session: import("next-auth").Session;
    loading: boolean;
    authenticated: boolean;
    isAdmin: any;
    isRestaurant: any;
    isSupplier: any;
    clientId: any;
    orgType: any;
};
export declare function useRole(): string[];
export declare function useTenant(): string;
export declare function useUserType(): 'RESTAURANT' | 'SUPPLIER' | 'ADMIN' | 'GUEST';
export declare function useFeatureFlag(flagKey: string): boolean;
//# sourceMappingURL=useAuth.d.ts.map