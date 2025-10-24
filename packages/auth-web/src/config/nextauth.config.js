"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authOptions = void 0;
const keycloak_1 = __importDefault(require("next-auth/providers/keycloak"));
exports.authOptions = {
    providers: [
        (0, keycloak_1.default)({
            clientId: process.env.KEYCLOAK_WEB_CLIENT_ID || 'supplify-web',
            clientSecret: process.env.KEYCLOAK_WEB_CLIENT_SECRET || 'web-client-secret',
            issuer: `${process.env.KEYCLOAK_URL || 'http://localhost:8080'}/realms/${process.env.KEYCLOAK_REALM || 'Supplify'}`,
            authorization: {
                params: {
                    scope: 'openid email profile',
                },
            },
        }),
    ],
    callbacks: {
        async jwt({ token, account, profile }) {
            // Persist the OAuth access_token and or the user id to the token right after signin
            if (account) {
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token;
                token.idToken = account.id_token;
            }
            // Add custom claims from Keycloak
            if (profile) {
                token.clientId = profile.client_id;
                token.orgType = profile.org_type;
                token.tier = profile.tier;
                token.roles = profile.realm_access?.roles || [];
            }
            return token;
        },
        async session({ session, token }) {
            // Send properties to the client
            if (token) {
                session.user.id = token.sub;
                session.user.clientId = token.clientId;
                session.user.orgType = token.orgType;
                session.user.tier = token.tier;
                session.user.roles = token.roles;
                session.accessToken = token.accessToken;
                session.refreshToken = token.refreshToken;
            }
            return session;
        },
    },
    pages: {
        signIn: '/auth/signin',
        signOut: '/auth/signout',
        error: '/auth/error',
    },
    session: {
        strategy: 'jwt',
        maxAge: 24 * 60 * 60, // 24 hours
    },
    jwt: {
        maxAge: 24 * 60 * 60, // 24 hours
    },
    secret: process.env.NEXTAUTH_SECRET,
    debug: process.env.NODE_ENV === 'development',
};
//# sourceMappingURL=nextauth.config.js.map