"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProtectedRoute = ProtectedRoute;
const useAuth_1 = require("../hooks/useAuth");
const router_1 = require("next/router");
const react_1 = require("react");
function ProtectedRoute({ children, requiredRoles, requiredOrgType, requireClientId, fallback = <div>Access denied</div> }) {
    const { user, loading, authenticated, clientId, orgType } = (0, useAuth_1.useAuth)();
    const router = (0, router_1.useRouter)();
    (0, react_1.useEffect)(() => {
        if (!loading && !authenticated) {
            router.push('/auth/signin');
            return;
        }
        if (authenticated && user) {
            // Check required roles
            if (requiredRoles && requiredRoles.length > 0) {
                const hasRequiredRole = requiredRoles.some(role => user.roles?.includes(role));
                if (!hasRequiredRole) {
                    router.push('/unauthorized');
                    return;
                }
            }
            // Check required org type
            if (requiredOrgType && orgType !== requiredOrgType) {
                router.push('/unauthorized');
                return;
            }
            // Check if client ID is required
            if (requireClientId && !clientId) {
                router.push('/pending-approval');
                return;
            }
        }
    }, [loading, authenticated, user, clientId, orgType, router, requiredRoles, requiredOrgType, requireClientId]);
    if (loading) {
        return <div>Loading...</div>;
    }
    if (!authenticated) {
        return null;
    }
    if (requiredRoles && requiredRoles.length > 0) {
        const hasRequiredRole = requiredRoles.some(role => user?.roles?.includes(role));
        if (!hasRequiredRole) {
            return <>{fallback}</>;
        }
    }
    if (requiredOrgType && orgType !== requiredOrgType) {
        return <>{fallback}</>;
    }
    if (requireClientId && !clientId) {
        return <>{fallback}</>;
    }
    return <>{children}</>;
}
//# sourceMappingURL=ProtectedRoute.js.map