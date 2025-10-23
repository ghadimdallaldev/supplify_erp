import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export interface AuthContext {
  user: {
    id: string;
    email: string;
    role: string;
    organizationId: string;
  };
  organization: {
    id: string;
    type: string;
    name: string;
  };
  clientId: string;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, context: ExecutionContext): AuthContext => {
    const gqlContext = GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    
    if (!req.user) {
      throw new UnauthorizedException('User not authenticated');
    }

    return {
      user: req.user,
      organization: req.organization,
      clientId: req.clientId,
    };
  },
);

export const ClientId = createParamDecorator(
  (data: unknown, context: ExecutionContext): string => {
    const gqlContext = GqlExecutionContext.create(context);
    const { req } = gqlContext.getContext();
    
    if (!req.clientId) {
      throw new UnauthorizedException('Client ID not found in context');
    }

    return req.clientId;
  },
);
