import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

export interface CognitoTokenPayload {
  sub: string;
  email: string;
  'cognito:groups'?: string[];
  'cognito:username': string;
  exp: number;
  iat: number;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export const createJwksClient = (issuer: string) => {
  return jwksClient({
    jwksUri: `${issuer}/.well-known/jwks.json`,
    cache: true,
    cacheMaxAge: 3600000, // 1 hour
  });
};

export const verifyToken = async (
  token: string,
  issuer: string,
  clientId: string,
): Promise<CognitoTokenPayload> => {
  const client = createJwksClient(issuer);

  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      (header, callback) => {
        client.getSigningKey(header.kid, (err, key) => {
          if (err) {
            callback(err);
            return;
          }
          const signingKey = key?.getPublicKey();
          callback(null, signingKey);
        });
      },
      {
        issuer,
        audience: clientId,
        algorithms: ['RS256'],
      },
      (err, decoded) => {
        if (err) {
          reject(new AuthError(err.message));
          return;
        }
        resolve(decoded as CognitoTokenPayload);
      },
    );
  });
};

export const extractTokenFromHeader = (authHeader?: string): string | null => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};

export const getUserRoleFromToken = (payload: CognitoTokenPayload): string | null => {
  const groups = payload['cognito:groups'] || [];
  // Return first group as role
  return groups.length > 0 ? groups[0].toUpperCase() : null;
};

