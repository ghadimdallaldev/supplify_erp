import { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FlagsServerService } from './index';
export declare const FLAG_KEY_METADATA = "flag_key";
/**
 * Decorator to mark a route/controller as requiring a feature flag
 */
export declare function RequireFlag(flagKey: string): (target: any, propertyName: string, descriptor: PropertyDescriptor) => PropertyDescriptor;
/**
 * Guard that checks feature flags before allowing access
 */
export declare class FlagGuard implements CanActivate {
    private reflector;
    private flagsService;
    constructor(reflector: Reflector, flagsService: FlagsServerService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
/**
 * GraphQL guard for feature flags
 */
export declare class GraphQLFlagGuard implements CanActivate {
    private flagsService;
    constructor(flagsService: FlagsServerService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private extractFlagContextFromGraphQL;
}
//# sourceMappingURL=guards.d.ts.map