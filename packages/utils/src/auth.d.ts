import jwksClient from 'jwks-rsa';
export interface CognitoTokenPayload {
    sub: string;
    email: string;
    'cognito:groups'?: string[];
    'cognito:username': string;
    exp: number;
    iat: number;
}
export declare class AuthError extends Error {
    constructor(message: string);
}
export declare const createJwksClient: (issuer: string) => jwksClient.JwksClient;
export declare const verifyToken: (token: string, issuer: string, clientId: string) => Promise<CognitoTokenPayload>;
export declare const extractTokenFromHeader: (authHeader?: string) => string | null;
export declare const getUserRoleFromToken: (payload: CognitoTokenPayload) => string | null;
//# sourceMappingURL=auth.d.ts.map