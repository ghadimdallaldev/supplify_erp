# Supplify v2 Setup Instructions

## Environment Setup

### 1. Create API Gateway Environment File

Create `apps/api-gateway/.env` with the following content:

```env
# Database
DATABASE_URL="postgresql://supplify:supplify@localhost:5432/supplify?schema=public"

# Keycloak
KEYCLOAK_URL="http://localhost:8080"
KEYCLOAK_REALM="Supplify"
KEYCLOAK_CLIENT_ID="supplify-gateway"
KEYCLOAK_CLIENT_SECRET="gateway-secret"

# Redis
REDIS_URL="redis://localhost:6379"

# Server
PORT=4000
NODE_ENV="development"

# Logging
LOG_LEVEL="info"
```

### 2. Create Web App Environment File

Create `apps/web/.env` with the following content:

```env
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_REALM=Supplify
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=supplify-web
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Quick Setup Commands

```bash
# 1. Install dependencies
pnpm install

# 2. Start Keycloak
pnpm keycloak:start

# 3. Start database (in another terminal)
cd infra/db && docker compose up -d

# 4. Generate Prisma client
pnpm db:generate

# 5. Run database migrations
pnpm db:migrate

# 6. Start development servers
pnpm dev
```

## Access Points

- **Web App**: http://localhost:3000
- **API Gateway**: http://localhost:4000
- **API Docs**: http://localhost:4000/api/docs
- **Keycloak Admin**: http://localhost:8080 (admin/admin)

## Troubleshooting

### Database Connection Issues
- Ensure PostgreSQL is running on port 5432
- Check that the DATABASE_URL is correct
- Verify database credentials

### Keycloak Issues
- Ensure Keycloak is running on port 8080
- Check that the realm is imported correctly
- Verify client configurations

### Prisma Issues
- Run `pnpm db:generate` after schema changes
- Run `pnpm db:migrate` to apply migrations
- Check that DATABASE_URL is set correctly
