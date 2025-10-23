import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthContext } from '../interfaces/auth.interface';

export const CurrentUser = createParamDecorator(
  (data: unknown, context: ExecutionContext): AuthContext => {
    const gqlContext = GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    
    if (!req.ctx) {
      throw new UnauthorizedException('User not authenticated');
    }

    return req.ctx;
  },
);

export const ClientId = createParamDecorator(
  (data: unknown, context: ExecutionContext): string => {
    const gqlContext = GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    
    if (!req.ctx?.clientId) {
      throw new UnauthorizedException('Client ID not found in context');
    }

    return req.ctx.clientId;
  },
);

export const UserId = createParamDecorator(
  (data: unknown, context: ExecutionContext): string => {
    const gqlContext = GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    
    if (!req.ctx?.userId) {
      throw new UnauthorizedException('User ID not found in context');
    }

    return req.ctx.userId;
  },
);

export const UserRoles = createParamDecorator(
  (data: unknown, context: ExecutionContext): string[] => {
    const gqlContext = GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    
    if (!req.ctx?.roles) {
      throw new UnauthorizedException('User roles not found in context');
    }

    return req.ctx.roles;
  },
);

export const OrgType = createParamDecorator(
  (data: unknown, context: ExecutionContext): string => {
    const gqlContext = GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    
    if (!req.ctx?.orgType) {
      throw new UnauthorizedException('Organization type not found in context');
    }

    return req.ctx.orgType;
  },
);
