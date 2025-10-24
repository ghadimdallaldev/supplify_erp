"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useAuth = useAuth;
exports.useRole = useRole;
exports.useTenant = useTenant;
exports.useUserType = useUserType;
exports.useFeatureFlag = useFeatureFlag;
const react_1 = require("next-auth/react");
function useAuth() {
    const { data: session, status } = (0, react_1.useSession)();
    return {
        user: session?.user,
        session,
        loading: status === 'loading',
        authenticated: status === 'authenticated',
        isAdmin: session?.user?.roles?.includes('admin') || session?.user?.roles?.includes('superadmin'),
        isRestaurant: session?.user?.roles?.includes('restaurant'),
        isSupplier: session?.user?.roles?.includes('supplier'),
        clientId: session?.user?.clientId,
        orgType: session?.user?.orgType,
    };
}
function useRole() {
    const { session } = useAuth();
    return session?.user?.roles || [];
}
function useTenant() {
    const { clientId } = useAuth();
    return clientId || '';
}
function useUserType() {
    const { orgType, isAdmin } = useAuth();
    if (isAdmin)
        return 'ADMIN';
    if (orgType === 'RESTAURANT')
        return 'RESTAURANT';
    if (orgType === 'SUPPLIER')
        return 'SUPPLIER';
    return 'GUEST';
}
function useFeatureFlag(flagKey) {
    // TODO: Integrate with feature flags service
    // For now, return true for all flags
    return true;
}
//# sourceMappingURL=useAuth.js.map