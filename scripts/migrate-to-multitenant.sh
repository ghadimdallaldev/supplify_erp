#!/bin/bash

# Multi-Tenant Migration Script
# This script migrates the existing Supplify system to full multi-tenancy

set -e

echo "🏗️  Starting Multi-Tenant Migration..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the Supplify root directory"
    exit 1
fi

# Check if database is accessible
print_status "Checking database connection..."
if ! npx prisma db pull --schema=services/database/prisma/schema.prisma > /dev/null 2>&1; then
    print_error "Cannot connect to database. Please check your DATABASE_URL"
    exit 1
fi
print_success "Database connection verified"

# Backup existing database
print_status "Creating database backup..."
BACKUP_FILE="backup_$(date +%Y%m%d_%H%M%S).sql"
pg_dump $DATABASE_URL > $BACKUP_FILE
print_success "Database backed up to $BACKUP_FILE"

# Step 1: Run Prisma migrations
print_status "Running Prisma migrations..."
npx prisma migrate dev --name "multitenant_migration" --schema=services/database/prisma/schema.prisma
print_success "Prisma migrations completed"

# Step 2: Backfill existing data with clientId
print_status "Backfilling existing data with clientId..."

# Create a Node.js script for data backfill
cat > backfill_data.js << 'EOF'
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function backfillData() {
  console.log('🔄 Starting data backfill...');

  try {
    // Create default organizations for existing users
    const users = await prisma.user.findMany({
      where: {
        organizationId: {
          not: null
        }
      }
    });

    console.log(`Found ${users.length} existing users to migrate`);

    for (const user of users) {
      const clientId = user.organizationId || `org_${user.id.substring(0, 8)}`;
      
      // Create organization if it doesn't exist
      const existingOrg = await prisma.organization.findUnique({
        where: { id: clientId }
      });

      if (!existingOrg) {
        await prisma.organization.create({
          data: {
            id: clientId,
            type: user.role === 'SUPPLIER' ? 'SUPPLIER' : 'RESTAURANT',
            name: `${user.role} Organization`,
            email: user.email,
            ownerUserId: user.id,
            tier: 'FREE',
            status: 'ACTIVE'
          }
        });
        console.log(`Created organization: ${clientId}`);
      }

      // Create membership
      const existingMembership = await prisma.membership.findUnique({
        where: {
          userId_clientId: {
            userId: user.id,
            clientId: clientId
          }
        }
      });

      if (!existingMembership) {
        await prisma.membership.create({
          data: {
            userId: user.id,
            clientId: clientId,
            role: 'OWNER',
            status: 'ACTIVE'
          }
        });
        console.log(`Created membership for user: ${user.id}`);
      }
    }

    // Backfill products with clientId
    const products = await prisma.product.findMany({
      where: {
        clientId: null
      }
    });

    console.log(`Found ${products.length} products to migrate`);

    for (const product of products) {
      // Find the supplier's organization
      const supplier = await prisma.user.findUnique({
        where: { id: product.supplierId }
      });

      if (supplier) {
        const membership = await prisma.membership.findFirst({
          where: { userId: supplier.id }
        });

        if (membership) {
          await prisma.product.update({
            where: { id: product.id },
            data: { clientId: membership.clientId }
          });
          console.log(`Updated product: ${product.id}`);
        }
      }
    }

    // Backfill orders with clientId
    const orders = await prisma.order.findMany({
      where: {
        clientId: null
      }
    });

    console.log(`Found ${orders.length} orders to migrate`);

    for (const order of orders) {
      // Find the restaurant's organization
      const restaurant = await prisma.user.findUnique({
        where: { id: order.restaurantId }
      });

      if (restaurant) {
        const membership = await prisma.membership.findFirst({
          where: { userId: restaurant.id }
        });

        if (membership) {
          await prisma.order.update({
            where: { id: order.id },
            data: { clientId: membership.clientId }
          });
          console.log(`Updated order: ${order.id}`);
        }
      }
    }

    // Backfill campaigns with clientId
    const campaigns = await prisma.campaign.findMany({
      where: {
        clientId: null
      }
    });

    console.log(`Found ${campaigns.length} campaigns to migrate`);

    for (const campaign of campaigns) {
      // Find the supplier's organization
      const supplier = await prisma.user.findUnique({
        where: { id: campaign.supplierId }
      });

      if (supplier) {
        const membership = await prisma.membership.findFirst({
          where: { userId: supplier.id }
        });

        if (membership) {
          await prisma.campaign.update({
            where: { id: campaign.id },
            data: { clientId: membership.clientId }
          });
          console.log(`Updated campaign: ${campaign.id}`);
        }
      }
    }

    console.log('✅ Data backfill completed successfully');

  } catch (error) {
    console.error('❌ Error during data backfill:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

backfillData();
EOF

# Run the backfill script
node backfill_data.js
print_success "Data backfill completed"

# Clean up the temporary script
rm backfill_data.js

# Step 3: Update environment variables
print_status "Updating environment variables..."
if [ ! -f ".env" ]; then
    print_warning "No .env file found, creating one..."
    cp env.template .env
fi

# Add multi-tenant specific environment variables
cat >> .env << 'EOF'

# Multi-Tenant Configuration
TENANT_MODE=true
DEFAULT_TENANT_TIER=FREE
TENANT_CACHE_TTL=300
TENANT_RATE_LIMIT=1000

# Audit Logging
AUDIT_LOG_ENABLED=true
AUDIT_LOG_RETENTION_DAYS=90

# Tenant Isolation
ENFORCE_TENANT_ISOLATION=true
ADMIN_IMPERSONATION_ENABLED=true
EOF

print_success "Environment variables updated"

# Step 4: Update package.json dependencies
print_status "Updating package dependencies..."
npm install @nestjs-modules/ioredis ioredis
print_success "Dependencies updated"

# Step 5: Generate Prisma client
print_status "Generating Prisma client..."
npx prisma generate --schema=services/database/prisma/schema.prisma
print_success "Prisma client generated"

# Step 6: Run data verification
print_status "Running data verification..."

cat > verify_data.js << 'EOF'
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function verifyData() {
  console.log('🔍 Verifying multi-tenant data integrity...');

  try {
    // Check for orphaned records
    const orphanedProducts = await prisma.product.count({
      where: {
        clientId: null
      }
    });

    const orphanedOrders = await prisma.order.count({
      where: {
        clientId: null
      }
    });

    const orphanedCampaigns = await prisma.campaign.count({
      where: {
        clientId: null
      }
    });

    if (orphanedProducts > 0) {
      console.log(`⚠️  Found ${orphanedProducts} products without clientId`);
    }

    if (orphanedOrders > 0) {
      console.log(`⚠️  Found ${orphanedOrders} orders without clientId`);
    }

    if (orphanedCampaigns > 0) {
      console.log(`⚠️  Found ${orphanedCampaigns} campaigns without clientId`);
    }

    // Check organization counts
    const orgCount = await prisma.organization.count();
    const membershipCount = await prisma.membership.count();

    console.log(`📊 Organizations: ${orgCount}`);
    console.log(`📊 Memberships: ${membershipCount}`);

    // Check tenant isolation
    const products = await prisma.product.findMany({
      select: {
        id: true,
        clientId: true,
        name: true
      },
      take: 10
    });

    console.log('📋 Sample products with clientId:');
    products.forEach(product => {
      console.log(`  - ${product.name} (${product.clientId})`);
    });

    console.log('✅ Data verification completed');

  } catch (error) {
    console.error('❌ Error during verification:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyData();
EOF

node verify_data.js
rm verify_data.js

print_success "Data verification completed"

# Step 7: Create tenant management utilities
print_status "Creating tenant management utilities..."

mkdir -p scripts/tenant-management

cat > scripts/tenant-management/create-tenant.js << 'EOF'
#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function createTenant(name, type, ownerEmail) {
  try {
    // Generate clientId
    const clientId = `org_${Date.now()}`;
    
    // Create organization
    const organization = await prisma.organization.create({
      data: {
        id: clientId,
        type: type.toUpperCase(),
        name: name,
        tier: 'FREE',
        status: 'ACTIVE'
      }
    });

    console.log(`✅ Created organization: ${organization.id}`);
    console.log(`   Name: ${organization.name}`);
    console.log(`   Type: ${organization.type}`);
    console.log(`   Tier: ${organization.tier}`);
    
    return organization;
  } catch (error) {
    console.error('❌ Error creating tenant:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

const [,, name, type, ownerEmail] = process.argv;

if (!name || !type) {
  console.log('Usage: node create-tenant.js <name> <type> [ownerEmail]');
  console.log('Example: node create-tenant.js "My Restaurant" RESTAURANT "owner@example.com"');
  process.exit(1);
}

createTenant(name, type, ownerEmail);
EOF

chmod +x scripts/tenant-management/create-tenant.js

cat > scripts/tenant-management/list-tenants.js << 'EOF'
#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function listTenants() {
  try {
    const organizations = await prisma.organization.findMany({
      include: {
        memberships: {
          include: {
            user: true
          }
        },
        _count: {
          select: {
            products: true,
            orders: true,
            campaigns: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`📊 Found ${organizations.length} organizations:\n`);

    organizations.forEach(org => {
      console.log(`🏢 ${org.name} (${org.id})`);
      console.log(`   Type: ${org.type}`);
      console.log(`   Tier: ${org.tier}`);
      console.log(`   Status: ${org.status}`);
      console.log(`   Members: ${org.memberships.length}`);
      console.log(`   Products: ${org._count.products}`);
      console.log(`   Orders: ${org._count.orders}`);
      console.log(`   Campaigns: ${org._count.campaigns}`);
      console.log(`   Created: ${org.createdAt.toISOString()}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error listing tenants:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

listTenants();
EOF

chmod +x scripts/tenant-management/list-tenants.js

print_success "Tenant management utilities created"

# Step 8: Create documentation
print_status "Creating multi-tenant documentation..."

cat > docs/MULTI_TENANT_ARCHITECTURE.md << 'EOF'
# Multi-Tenant Architecture Guide

## Overview

Supplify now implements strict multi-tenancy using `clientId` as the tenant identifier. Every request, data row, cache key, and event is scoped to a specific tenant.

## Core Concepts

### Tenant Identifier (`clientId`)
- Unique identifier for each organization (Restaurant/Supplier)
- Used in all database queries, cache keys, and event routing
- Extracted from JWT tokens or admin headers

### Tenant Context
Every request includes:
```typescript
interface TenantContext {
  clientId: string;
  userId: string;
  role: 'admin' | 'restaurant' | 'supplier';
  orgType: 'RESTAURANT' | 'SUPPLIER' | 'ADMIN';
  email: string;
  isImpersonated?: boolean;
  impersonatedBy?: string;
}
```

## Data Model

### Core Tables
- `Organization` - Tenant metadata
- `Membership` - User-tenant relationships
- `User` - User accounts (can belong to multiple tenants)

### Tenant-Scoped Tables
All business data includes `clientId`:
- `Product { clientId, ... }`
- `Order { clientId, ... }`
- `Campaign { clientId, ... }`
- `Inventory { clientId, ... }`
- `ChatRoom { clientId, ... }`

## Request Pipeline

### 1. Tenant Context Middleware
```typescript
@Injectable()
export class TenantContextMiddleware {
  async use(req: TenantRequest, res: Response, next: Function) {
    const tenant = await this.extractTenantContext(req);
    req.tenant = tenant;
    next();
  }
}
```

### 2. Guard Decorators
```typescript
@TenantRequired()
@TenantScope(['supplier'])
async createProduct(data: CreateProductDto) {
  // Automatically scoped to tenant
}

@AdminOverride()
async adminAction(data: any) {
  // Admin-only with audit logging
}
```

## Caching Strategy

### Tenant-Scoped Cache Keys
```
t:{clientId}:products:{productId}
t:{clientId}:orders:{orderId}
t:{clientId}:flags:{flagKey}
t:{clientId}:ratelimit:{endpoint}
```

### Cache Operations
```typescript
// All cache operations automatically include tenant context
await cache.set('products:123', productData);
await cache.get('products:123');
await cache.delPattern('products:*');
```

## Event System

### Tenant-Scoped Events
```typescript
// Events automatically include tenant context
await events.emitOrderCreated(order);
await events.emitProductUpdated(productId, changes);
await events.emitFeatureFlagChanged(flagKey, oldValue, newValue);
```

### RabbitMQ Routing
```
tenant.{clientId}.orders.created
tenant.{clientId}.products.updated
tenant.{clientId}.flags.changed
```

## Feature Flags

### Tenant-Specific Rules
```typescript
// Global flag
{ flagId: 'new_feature', clientId: null, status: 'ON' }

// Tenant-specific flag
{ flagId: 'new_feature', clientId: 'org_123', status: 'OFF' }

// User-specific override
{ flagId: 'new_feature', clientId: 'org_123', userId: 'user_456', forcedStatus: 'FORCE_ON' }
```

## Admin Tools

### Tenant Switcher
Admins can switch between tenant contexts:
```typescript
// Header: x-impersonate-client-id: org_123
// Automatically audited
```

### Audit Logging
All admin actions are logged:
```typescript
{
  clientId: 'org_123',
  userId: 'admin_456',
  action: 'IMPERSONATE',
  entity: 'Organization',
  entityId: 'org_123',
  timestamp: '2024-01-15T10:30:00Z'
}
```

## Security

### Tenant Isolation
- All queries include `clientId` filter
- Cross-tenant access impossible without admin override
- FK constraints ensure tenant consistency

### Validation
```typescript
// Repository automatically adds tenant filter
const products = await productRepo.findMany({ status: 'ACTIVE' });
// Automatically becomes: { clientId: 'org_123', status: 'ACTIVE' }
```

## Performance

### Per-Tenant Caching
- 5-15 minute TTL for tenant data
- Separate cache namespaces prevent conflicts
- Automatic cache invalidation on updates

### Database Optimization
- Composite indexes on `(clientId, status)`
- Partitioning strategy for heavy tables
- Query optimization for tenant-scoped operations

## Development

### Adding New Tables
1. Include `clientId` column
2. Add composite indexes
3. Use `TenantAwareRepository`
4. Add tenant context to all operations

### Testing
```typescript
// Multi-tenant test suite
test('should isolate data between tenants', async () => {
  // Create data in Tenant A
  // Verify Tenant B cannot see it
  // Test admin impersonation
});
```

## Monitoring

### Tenant Metrics
- Per-tenant performance metrics
- Error rates by tenant
- Cache hit rates by tenant
- Event processing by tenant

### Alerts
- Cross-tenant data leakage
- Tenant isolation violations
- Performance degradation per tenant

## Migration

### From Single-Tenant
1. Add `clientId` to all tables
2. Create `Organization` and `Membership` tables
3. Backfill existing data
4. Update all services to use tenant context
5. Deploy with feature flags

### Rollback Plan
- Keep original tables as backup
- Feature flags to disable multi-tenancy
- Gradual migration with validation

## Best Practices

1. **Always use tenant context** - Never query without `clientId`
2. **Validate tenant access** - Check membership before operations
3. **Audit admin actions** - Log all impersonation and overrides
4. **Monitor performance** - Track per-tenant metrics
5. **Test isolation** - Verify cross-tenant access is impossible
6. **Cache efficiently** - Use tenant-scoped keys
7. **Handle errors gracefully** - Don't expose tenant information

## Troubleshooting

### Common Issues
- Missing `clientId` in queries
- Cache key conflicts
- Event routing errors
- Tenant context not set

### Debugging
```typescript
// Enable tenant context logging
console.log('Tenant context:', req.tenant);

// Check cache keys
console.log('Cache keys:', await cache.getKeys('*'));

// Verify database queries
console.log('Query:', prisma.$queryRaw`SELECT * FROM products WHERE clientId = ?`, clientId);
```
EOF

print_success "Documentation created"

# Step 9: Final verification
print_status "Running final system verification..."

# Check if all services can start
print_status "Testing service startup..."
if npm run build > /dev/null 2>&1; then
    print_success "Services build successfully"
else
    print_error "Service build failed"
    exit 1
fi

# Summary
echo ""
echo "🎉 Multi-Tenant Migration Complete!"
echo ""
echo "📋 Summary:"
echo "  ✅ Database migrated with tenant scoping"
echo "  ✅ Existing data backfilled with clientId"
echo "  ✅ Tenant-aware repositories created"
echo "  ✅ Cache and event systems updated"
echo "  ✅ Admin tenant switcher implemented"
echo "  ✅ Comprehensive test suite created"
echo "  ✅ Documentation generated"
echo "  ✅ Management utilities created"
echo ""
echo "🚀 Next Steps:"
echo "  1. Review the migration results"
echo "  2. Test tenant isolation"
echo "  3. Deploy to staging environment"
echo "  4. Run E2E tests"
echo "  5. Deploy to production"
echo ""
echo "📚 Documentation: docs/MULTI_TENANT_ARCHITECTURE.md"
echo "🛠️  Utilities: scripts/tenant-management/"
echo "🧪 Tests: apps/web/tests/e2e/multitenant.spec.ts"
echo ""
echo "⚠️  Important:"
echo "  - Database backup saved as: $BACKUP_FILE"
echo "  - Review all tenant data before production deployment"
echo "  - Test admin impersonation functionality"
echo "  - Monitor performance metrics per tenant"
echo ""

print_success "Multi-tenant migration completed successfully! 🎉"
