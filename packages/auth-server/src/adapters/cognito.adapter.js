"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var CognitoAdapter_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CognitoAdapter = void 0;
const common_1 = require("@nestjs/common");
let CognitoAdapter = CognitoAdapter_1 = class CognitoAdapter {
    logger = new common_1.Logger(CognitoAdapter_1.name);
    async verifyBearer(token) {
        // TODO: Implement Cognito token verification
        this.logger.warn('CognitoAdapter not yet implemented');
        throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
    }
    async getUser(id) {
        // TODO: Implement Cognito user retrieval
        this.logger.warn('CognitoAdapter not yet implemented');
        throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
    }
    async setUserAttributes(id, attrs) {
        // TODO: Implement Cognito user attribute updates
        this.logger.warn('CognitoAdapter not yet implemented');
        throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
    }
    async assignRealmRoles(userId, roles) {
        // TODO: Implement Cognito role assignment
        this.logger.warn('CognitoAdapter not yet implemented');
        throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
    }
    async removeRealmRoles(userId, roles) {
        // TODO: Implement Cognito role removal
        this.logger.warn('CognitoAdapter not yet implemented');
        throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
    }
    async createUser(userData) {
        // TODO: Implement Cognito user creation
        this.logger.warn('CognitoAdapter not yet implemented');
        throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
    }
    async updateUser(id, userData) {
        // TODO: Implement Cognito user updates
        this.logger.warn('CognitoAdapter not yet implemented');
        throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
    }
    async deleteUser(id) {
        // TODO: Implement Cognito user deletion
        this.logger.warn('CognitoAdapter not yet implemented');
        throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
    }
    async getServiceToken() {
        // TODO: Implement Cognito service token
        this.logger.warn('CognitoAdapter not yet implemented');
        throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
    }
    async invalidateUserSessions(userId) {
        // TODO: Implement Cognito session invalidation
        this.logger.warn('CognitoAdapter not yet implemented');
        throw new Error('CognitoAdapter not implemented - use KeycloakAdapter for now');
    }
};
exports.CognitoAdapter = CognitoAdapter;
exports.CognitoAdapter = CognitoAdapter = CognitoAdapter_1 = __decorate([
    (0, common_1.Injectable)()
], CognitoAdapter);
//# sourceMappingURL=cognito.adapter.js.map