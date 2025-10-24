import type { UserRole } from '@supplify/config';
export interface User {
    id: string;
    cognitoSub: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    organizationId: string;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export interface AuthContext {
    user: User;
    token: string;
}
//# sourceMappingURL=user.d.ts.map