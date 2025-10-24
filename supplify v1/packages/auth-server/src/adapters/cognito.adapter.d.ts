import { AuthAdapter, AuthContext, UserProfile } from '../interfaces/auth.interface';
export declare class CognitoAdapter implements AuthAdapter {
    private readonly logger;
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
//# sourceMappingURL=cognito.adapter.d.ts.map