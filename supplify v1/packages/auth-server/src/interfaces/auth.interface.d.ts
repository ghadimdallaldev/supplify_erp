export interface AuthContext {
    userId: string;
    email?: string;
    roles: string[];
    clientId: string;
    orgType: 'SUPPLIER' | 'RESTAURANT' | 'ADMIN';
    token: string;
    firstName?: string;
    lastName?: string;
    tier?: string;
}
export interface UserProfile {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    attributes: Record<string, string>;
    roles: string[];
    enabled: boolean;
    emailVerified: boolean;
}
export interface AuthAdapter {
    verifyBearer(token: string): Promise<AuthContext>;
    getUser(id: string): Promise<UserProfile>;
    setUserAttributes(id: string, attrs: Record<string, string>): Promise<void>;
    assignRealmRoles(userId: string, roles: string[]): Promise<void>;
    removeRealmRoles(userId: string, roles: string[]): Promise<void>;
    createUser(userData: {
        email: string;
        firstName: string;
        lastName: string;
        password: string;
        attributes?: Record<string, string>;
    }): Promise<string>;
    updateUser(id: string, userData: Partial<UserProfile>): Promise<void>;
    deleteUser(id: string): Promise<void>;
    getServiceToken(): Promise<string>;
    invalidateUserSessions(userId: string): Promise<void>;
}
export interface JwtPayload {
    sub: string;
    email?: string;
    given_name?: string;
    family_name?: string;
    client_id?: string;
    org_type?: string;
    tier?: string;
    realm_access?: {
        roles: string[];
    };
    iss: string;
    aud: string | string[];
    exp: number;
    iat: number;
    jti: string;
}
//# sourceMappingURL=auth.interface.d.ts.map