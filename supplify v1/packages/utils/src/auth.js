"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserRoleFromToken = exports.extractTokenFromHeader = exports.verifyToken = exports.createJwksClient = exports.AuthError = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const jwks_rsa_1 = __importDefault(require("jwks-rsa"));
class AuthError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuthError';
    }
}
exports.AuthError = AuthError;
const createJwksClient = (issuer) => {
    return (0, jwks_rsa_1.default)({
        jwksUri: `${issuer}/.well-known/jwks.json`,
        cache: true,
        cacheMaxAge: 3600000, // 1 hour
    });
};
exports.createJwksClient = createJwksClient;
const verifyToken = async (token, issuer, clientId) => {
    const client = (0, exports.createJwksClient)(issuer);
    return new Promise((resolve, reject) => {
        jsonwebtoken_1.default.verify(token, (header, callback) => {
            client.getSigningKey(header.kid, (err, key) => {
                if (err) {
                    callback(err);
                    return;
                }
                const signingKey = key?.getPublicKey();
                callback(null, signingKey);
            });
        }, {
            issuer,
            audience: clientId,
            algorithms: ['RS256'],
        }, (err, decoded) => {
            if (err) {
                reject(new AuthError(err.message));
                return;
            }
            resolve(decoded);
        });
    });
};
exports.verifyToken = verifyToken;
const extractTokenFromHeader = (authHeader) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
};
exports.extractTokenFromHeader = extractTokenFromHeader;
const getUserRoleFromToken = (payload) => {
    const groups = payload['cognito:groups'] || [];
    // Return first group as role
    return groups.length > 0 ? groups[0].toUpperCase() : null;
};
exports.getUserRoleFromToken = getUserRoleFromToken;
//# sourceMappingURL=auth.js.map