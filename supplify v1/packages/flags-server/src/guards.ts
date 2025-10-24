import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FlagsServerService, FlagContext, extractFlagContextFromRequest } from './index';

export const FLAG_KEY_METADATA = 'flag_key';

/**
 * Decorator to mark a route/controller as requiring a feature flag
 */
export function RequireFlag(flagKey: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    Reflect.defineMetadata(FLAG_KEY_METADATA, flagKey, descriptor.value);
    return descriptor;
  };
}

/**
 * Guard that checks feature flags before allowing access
 */
@Injectable()
export class FlagGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private flagsService: FlagsServerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flagKey = this.reflector.get<string>(
      FLAG_KEY_METADATA,
      context.getHandler(),
    );

    if (!flagKey) {
      return true; // No flag requirement
    }

    const request = context.switchToHttp().getRequest();
    const flagContext: FlagContext = extractFlagContextFromRequest(request);

    try {
      await this.flagsService.requireFlag(flagKey, flagContext);
      return true;
    } catch (error) {
      throw new ForbiddenException(`Feature "${flagKey}" is not enabled`);
    }
  }
}

/**
 * GraphQL guard for feature flags
 */
@Injectable()
export class GraphQLFlagGuard implements CanActivate {
  constructor(private flagsService: FlagsServerService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const flagKey = this.reflector.get<string>(
      FLAG_KEY_METADATA,
      context.getHandler(),
    );

    if (!flagKey) {
      return true; // No flag requirement
    }

    const gqlContext = context.getArgByIndex(2); // GraphQL context
    const flagContext: FlagContext = this.extractFlagContextFromGraphQL(gqlContext);

    try {
      await this.flagsService.requireFlag(flagKey, flagContext);
      return true;
    } catch (error) {
      throw new ForbiddenException(`Feature "${flagKey}" is not enabled`);
    }
  }

  private extractFlagContextFromGraphQL(context: any): FlagContext {
    const user = context.user || {};
    const headers = context.req?.headers || {};
    
    return {
      env: (headers['x-environment'] as any) || 'dev',
      orgType: user.orgType || headers['x-org-type'],
      orgId: user.orgId || headers['x-org-id'],
      userId: user.id || headers['x-user-id'],
    };
  }
}
