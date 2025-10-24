import { ReactNode } from 'react';
interface ProtectedRouteProps {
    children: ReactNode;
    requiredRoles?: string[];
    requiredOrgType?: 'RESTAURANT' | 'SUPPLIER' | 'ADMIN';
    requireClientId?: boolean;
    fallback?: ReactNode;
}
export declare function ProtectedRoute({ children, requiredRoles, requiredOrgType, requireClientId, fallback }: ProtectedRouteProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=ProtectedRoute.d.ts.map