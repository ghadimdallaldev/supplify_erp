# Keycloak Authentication Setup

This document describes how to set up and configure Keycloak for the Supplify ERP system.

## Overview

Keycloak is used as the identity provider for the Supplify ERP system, providing:
- OpenID Connect (OIDC) authentication
- Role-based access control (RBAC)
- Multi-tenancy with client ID claims
- Admin approval workflow
- SSO for web and admin applications

## Prerequisites

- Docker and Docker Compose
- Node.js 18+
- PostgreSQL (for Keycloak database)

## Quick Start

### 1. Start Keycloak

```bash
# Start Keycloak with Docker Compose
cd infra/keycloak
docker-compose up -d

# Wait for Keycloak to be ready
docker-compose logs -f keycloak
```

### 2. Access Keycloak Admin Console

- URL: http://localhost:8080
- Username: `admin`
- Password: `admin_password`

### 3. Seed Initial Configuration

```bash
# Install dependencies
npm install

# Run the seeding script
npx ts-node scripts/keycloak-seed.ts
```

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Keycloak Configuration
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=Supplify
KEYCLOAK_WEB_CLIENT_ID=supplify-web
KEYCLOAK_WEB_CLIENT_SECRET=web-client-secret
KEYCLOAK_ADMIN_CLIENT_ID=supplify-admin
KEYCLOAK_ADMIN_CLIENT_SECRET=admin-client-secret
KEYCLOAK_GATEWAY_CLIENT_ID=supplify-gateway
KEYCLOAK_GATEWAY_CLIENT_SECRET=gateway-client-secret
KEYCLOAK_ADMIN_USER=admin
KEYCLOAK_ADMIN_PASS=admin_password

# NextAuth Configuration
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-here
```

### Realm Configuration

The Supplify realm includes:

#### Clients
- **supplify-web**: Public client for Next.js web application
- **supplify-admin**: Confidential client for admin console
- **supplify-gateway**: Service account for API Gateway

#### Roles
- **admin**: Administrator role with full access
- **supplier**: Supplier role for managing products and orders
- **restaurant**: Restaurant role for managing orders and inventory
- **superadmin**: Super administrator role with system-wide access

#### Protocol Mappers
- **client_id**: Maps user attribute to JWT token
- **org_type**: Maps organization type to JWT token
- **tier**: Maps subscription tier to JWT token

## Authentication Flow

### 1. User Registration

1. User registers via Keycloak self-service
2. User status is set to `PENDING`
3. User cannot access application until approved

### 2. Admin Approval

1. Admin reviews pending users in admin console
2. Admin approves user and assigns:
   - Client ID (tenant identifier)
   - Organization type (RESTAURANT/SUPPLIER)
   - Roles (restaurant/supplier + admin if needed)
3. User sessions are invalidated
4. User must re-login to get new claims

### 3. Application Access

1. User logs in via NextAuth with Keycloak provider
2. JWT token includes client ID and organization type
3. Backend validates token and extracts tenant context
4. All operations are scoped by client ID

## Backend Integration

### Auth Adapter

The system uses an `AuthAdapter` interface to abstract authentication:

```typescript
export interface AuthAdapter {
  verifyBearer(token: string): Promise<AuthContext>;
  getUser(id: string): Promise<UserProfile>;
  setUserAttributes(id: string, attrs: Record<string, string>): Promise<void>;
  assignRealmRoles(userId: string, roles: string[]): Promise<void>;
  // ... other methods
}
```

### Guards and Decorators

```typescript
// Role-based access control
@Roles(['admin', 'supplier'])
@UseGuards(AuthGuard)
async someEndpoint() { }

// Tenant scoping
@TenantRequired()
@UseGuards(AuthGuard)
async tenantScopedEndpoint(@ClientId() clientId: string) { }

// Organization type restriction
@TenantScope('RESTAURANT')
@UseGuards(AuthGuard)
async restaurantOnlyEndpoint() { }
```

## Frontend Integration

### NextAuth Configuration

```typescript
// apps/web/src/pages/api/auth/[...nextauth].ts
import { authOptions } from '@supplify/auth-web';

export default NextAuth(authOptions);
```

### Authentication Hooks

```typescript
import { useAuth } from '@supplify/auth-web';

function MyComponent() {
  const { user, clientId, orgType, isRestaurant, isSupplier } = useAuth();
  
  return (
    <div>
      <p>Welcome {user?.email}</p>
      <p>Client ID: {clientId}</p>
      <p>Organization Type: {orgType}</p>
    </div>
  );
}
```

### Protected Routes

```typescript
import { ProtectedRoute } from '@supplify/auth-web';

function RestaurantDashboard() {
  return (
    <ProtectedRoute requiredRoles={['restaurant']} requireClientId>
      <div>Restaurant Dashboard</div>
    </ProtectedRoute>
  );
}
```

## Multi-Tenancy

### Client ID Claims

Every JWT token includes a `client_id` claim that identifies the tenant:

```json
{
  "sub": "user-id",
  "email": "user@example.com",
  "client_id": "rest-golden-fork-a1b2c3",
  "org_type": "RESTAURANT",
  "realm_access": {
    "roles": ["restaurant", "admin"]
  }
}
```

### Database Scoping

All database queries are automatically scoped by client ID:

```typescript
// All queries include clientId filter
const orders = await prisma.order.findMany({
  where: { clientId: authContext.clientId }
});
```

## Security Features

### Token Validation

- JWT signature verification using JWKS
- Audience validation
- Issuer validation
- Expiration checking
- Nonce validation (if configured)

### Password Policy

- Minimum 8 characters
- At least 1 digit
- At least 1 lowercase letter
- At least 1 uppercase letter
- At least 1 special character
- Cannot be username

### Session Management

- Refresh token rotation
- Session timeout
- Concurrent session limits
- Logout from all devices

## Troubleshooting

### Common Issues

1. **Token verification fails**
   - Check KEYCLOAK_URL and KEYCLOAK_REALM
   - Verify JWKS endpoint is accessible
   - Check token expiration

2. **Client ID missing**
   - Ensure user is approved by admin
   - Check protocol mappers are configured
   - Verify user attributes are set

3. **Role access denied**
   - Check user roles in Keycloak
   - Verify role assignments
   - Check guard configurations

### Debug Mode

Enable debug logging:

```env
NODE_ENV=development
```

### Keycloak Admin API

Use the Keycloak Admin API for troubleshooting:

```bash
# Get realm info
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:8080/admin/realms/Supplify

# Get user info
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:8080/admin/realms/Supplify/users/$USER_ID
```

## Migration from Cognito

The system is designed to be easily migrated from Keycloak to Cognito:

1. Implement `CognitoAdapter` with same interface
2. Update environment variables
3. No changes needed in business logic

## Production Considerations

### Security

- Use HTTPS in production
- Rotate secrets regularly
- Enable MFA for admin users
- Monitor failed login attempts
- Regular security audits

### Performance

- Configure Redis for session storage
- Use database connection pooling
- Enable token caching
- Monitor Keycloak performance

### High Availability

- Deploy Keycloak in cluster mode
- Use external database
- Configure load balancing
- Set up monitoring and alerting

## Support

For issues or questions:
1. Check the troubleshooting section
2. Review Keycloak documentation
3. Contact the development team
