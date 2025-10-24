"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var KeycloakAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeycloakAdapter = void 0;
const common_1 = require("@nestjs/common");
const jose_1 = require("jose");
const keycloak_admin_client_1 = __importDefault(require("@keycloak/keycloak-admin-client"));
let KeycloakAdapter = KeycloakAdapter_1 = class KeycloakAdapter {
    logger = new common_1.Logger(KeycloakAdapter_1.name);
    kcAdminClient;
    jwks;
    constructor() {
        this.kcAdminClient = new keycloak_admin_client_1.default({
            baseUrl: process.env.KEYCLOAK_URL || 'http://localhost:8080',
            realmName: process.env.KEYCLOAK_REALM || 'Supplify',
        });
        // Initialize JWKS for token verification
        this.jwks = (0, jose_1.createRemoteJWKSet)(new URL(`${process.env.KEYCLOAK_URL || 'http://localhost:8080'}/realms/${process.env.KEYCLOAK_REALM || 'Supplify'}/protocol/openid-connect/certs`));
        // Authenticate admin client
        this.authenticateAdmin();
    }
    async authenticateAdmin() {
        try {
            await this.kcAdminClient.auth({
                username: process.env.KEYCLOAK_ADMIN_USER || 'admin',
                password: process.env.KEYCLOAK_ADMIN_PASS || 'admin_password',
                grantType: 'password',
                clientId: process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'admin-cli',
            });
            this.logger.log('✅ Keycloak admin authentication successful');
        }
        catch (error) {
            this.logger.error('❌ Failed to authenticate with Keycloak admin:', error);
        }
    }
    async verifyBearer(token) {
        try {
            const { payload } = await (0, jose_1.jwtVerify)(token, this.jwks, {
                issuer: `${process.env.KEYCLOAK_URL || 'http://localhost:8080'}/realms/${process.env.KEYCLOAK_REALM || 'Supplify'}`,
                audience: [
                    process.env.KEYCLOAK_WEB_CLIENT_ID || 'supplify-web',
                    process.env.KEYCLOAK_ADMIN_CLIENT_ID || 'supplify-admin',
                    process.env.KEYCLOAK_GATEWAY_CLIENT_ID || 'supplify-gateway',
                ],
            });
            const jwtPayload = payload;
            // Extract roles from realm_access
            const roles = jwtPayload.realm_access?.roles || [];
            // Determine org type from roles
            let orgType = 'ADMIN';
            if (roles.includes('restaurant')) {
                orgType = 'RESTAURANT';
            }
            else if (roles.includes('supplier')) {
                orgType = 'SUPPLIER';
            }
            else if (roles.includes('admin') || roles.includes('superadmin')) {
                orgType = 'ADMIN';
            }
            const authContext = {
                userId: jwtPayload.sub,
                email: jwtPayload.email,
                roles,
                clientId: jwtPayload.client_id || '',
                orgType,
                token,
                firstName: jwtPayload.given_name,
                lastName: jwtPayload.family_name,
                tier: jwtPayload.tier,
            };
            // Validate required fields
            if (!authContext.clientId) {
                throw new Error('Client ID not found in token');
            }
            if (authContext.clientId === '' && orgType !== 'ADMIN') {
                throw new Error('Client ID is required for non-admin users');
            }
            return authContext;
        }
        catch (error) {
            this.logger.error('❌ Token verification failed:', error);
            throw new Error(`Invalid token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getUser(id) {
        try {
            const user = await this.kcAdminClient.users.findOne({ id });
            if (!user) {
                throw new Error('User not found');
            }
            return {
                id: user.id,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                attributes: user.attributes || {},
                roles: [], // Will be populated separately
                enabled: user.enabled || false,
                emailVerified: user.emailVerified || false,
            };
        }
        catch (error) {
            this.logger.error(`❌ Failed to get user ${id}:`, error);
            throw new Error(`User not found: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async setUserAttributes(id, attrs) {
        try {
            await this.kcAdminClient.users.update({ id }, { attributes: attrs });
            this.logger.log(`✅ Updated attributes for user ${id}`);
        }
        catch (error) {
            this.logger.error(`❌ Failed to update attributes for user ${id}:`, error);
            throw new Error(`Failed to update user attributes: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async assignRealmRoles(userId, roles) {
        try {
            const realmRoles = await Promise.all(roles.map(roleName => this.kcAdminClient.roles.findOneByName({ name: roleName })));
            await this.kcAdminClient.users.addRealmRoleMappings({
                id: userId,
                roles: realmRoles.filter((role) => Boolean(role && role.id)).map(role => ({
                    id: role.id,
                    name: role.name || '',
                })),
            });
            this.logger.log(`✅ Assigned roles ${roles.join(', ')} to user ${userId}`);
        }
        catch (error) {
            this.logger.error(`❌ Failed to assign roles to user ${userId}:`, error);
            throw new Error(`Failed to assign roles: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async removeRealmRoles(userId, roles) {
        try {
            const realmRoles = await Promise.all(roles.map(roleName => this.kcAdminClient.roles.findOneByName({ name: roleName })));
            await this.kcAdminClient.users.delRealmRoleMappings({
                id: userId,
                roles: realmRoles.filter((role) => Boolean(role && role.id)).map(role => ({
                    id: role.id,
                    name: role.name || '',
                })),
            });
            this.logger.log(`✅ Removed roles ${roles.join(', ')} from user ${userId}`);
        }
        catch (error) {
            this.logger.error(`❌ Failed to remove roles from user ${userId}:`, error);
            throw new Error(`Failed to remove roles: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async createUser(userData) {
        try {
            const { id } = await this.kcAdminClient.users.create({
                email: userData.email,
                firstName: userData.firstName,
                lastName: userData.lastName,
                username: userData.email,
                enabled: true,
                emailVerified: false,
                attributes: {
                    ...userData.attributes,
                    status: 'PENDING',
                },
                credentials: [{
                        type: 'password',
                        value: userData.password,
                        temporary: true,
                    }],
            });
            this.logger.log(`✅ Created user ${userData.email} with ID ${id}`);
            return id;
        }
        catch (error) {
            this.logger.error(`❌ Failed to create user ${userData.email}:`, error);
            throw new Error(`Failed to create user: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async updateUser(id, userData) {
        try {
            await this.kcAdminClient.users.update({ id }, {
                email: userData.email,
                firstName: userData.firstName,
                lastName: userData.lastName,
                enabled: userData.enabled,
                emailVerified: userData.emailVerified,
                attributes: userData.attributes,
            });
            this.logger.log(`✅ Updated user ${id}`);
        }
        catch (error) {
            this.logger.error(`❌ Failed to update user ${id}:`, error);
            throw new Error(`Failed to update user: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async deleteUser(id) {
        try {
            await this.kcAdminClient.users.del({ id });
            this.logger.log(`✅ Deleted user ${id}`);
        }
        catch (error) {
            this.logger.error(`❌ Failed to delete user ${id}:`, error);
            throw new Error(`Failed to delete user: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async getServiceToken() {
        try {
            await this.kcAdminClient.auth({
                grantType: 'client_credentials',
                clientId: process.env.KEYCLOAK_GATEWAY_CLIENT_ID || 'supplify-gateway',
                clientSecret: process.env.KEYCLOAK_GATEWAY_CLIENT_SECRET || 'gateway-client-secret',
            });
            // Get the token from the client
            const token = await this.kcAdminClient.getAccessToken();
            if (!token) {
                throw new Error('Failed to get access token');
            }
            return token;
        }
        catch (error) {
            this.logger.error('❌ Failed to get service token:', error);
            throw new Error(`Failed to get service token: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async invalidateUserSessions(userId) {
        try {
            await this.kcAdminClient.users.logout({ id: userId });
            this.logger.log(`✅ Invalidated sessions for user ${userId}`);
        }
        catch (error) {
            this.logger.error(`❌ Failed to invalidate sessions for user ${userId}:`, error);
            throw new Error(`Failed to invalidate user sessions: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
};
exports.KeycloakAdapter = KeycloakAdapter;
exports.KeycloakAdapter = KeycloakAdapter = KeycloakAdapter_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], KeycloakAdapter);
//# sourceMappingURL=keycloak.adapter.js.map