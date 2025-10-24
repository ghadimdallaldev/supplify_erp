"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OrgType = exports.UserRoles = exports.UserId = exports.ClientId = exports.CurrentUser = void 0;
const common_1 = require("@nestjs/common");
const graphql_1 = require("@nestjs/graphql");
exports.CurrentUser = (0, common_1.createParamDecorator)((data, context) => {
    const gqlContext = graphql_1.GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    if (!req.ctx) {
        throw new common_1.UnauthorizedException('User not authenticated');
    }
    return req.ctx;
});
exports.ClientId = (0, common_1.createParamDecorator)((data, context) => {
    const gqlContext = graphql_1.GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    if (!req.ctx?.clientId) {
        throw new common_1.UnauthorizedException('Client ID not found in context');
    }
    return req.ctx.clientId;
});
exports.UserId = (0, common_1.createParamDecorator)((data, context) => {
    const gqlContext = graphql_1.GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    if (!req.ctx?.userId) {
        throw new common_1.UnauthorizedException('User ID not found in context');
    }
    return req.ctx.userId;
});
exports.UserRoles = (0, common_1.createParamDecorator)((data, context) => {
    const gqlContext = graphql_1.GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    if (!req.ctx?.roles) {
        throw new common_1.UnauthorizedException('User roles not found in context');
    }
    return req.ctx.roles;
});
exports.OrgType = (0, common_1.createParamDecorator)((data, context) => {
    const gqlContext = graphql_1.GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    if (!req.ctx?.orgType) {
        throw new common_1.UnauthorizedException('Organization type not found in context');
    }
    return req.ctx.orgType;
});
//# sourceMappingURL=auth.decorator.js.map