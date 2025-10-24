# Supplify v2

A fresh, production-ready restaurant supply management platform built with Keycloak-first authentication, strict multi-tenancy, and clean architecture.

## 🏗️ Architecture

- **Frontend**: Next.js 14 with App Router, React Query, Tailwind CSS
- **Backend**: NestJS 10 with Fastify, Prisma ORM
- **Authentication**: Keycloak with OIDC and PKCE
- **Database**: PostgreSQL with Redis for caching
- **Monorepo**: pnpm workspace with TypeScript

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker and Docker Compose

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Infrastructure

Start Keycloak and Database:

```bash
# Start Keycloak
pnpm keycloak:start

# Start Database and Redis (in another terminal)
cd infra/db && docker compose up -d
```

### 3. Setup Database

```bash
# Generate Prisma client and run migrations
pnpm db:generate
pnpm db:migrate
```

### 4. Start Development Servers

```bash
# Start both web app and API gateway
pnpm dev
```

### 5. Access the Application

- **Web App**: http://localhost:3000
- **API Gateway**: http://localhost:4000
- **API Documentation**: http://localhost:4000/api/docs
- **Keycloak Admin**: http://localhost:8080 (admin/admin)

## 🔐 Authentication

Supplify v2 uses Keycloak for authentication with the following setup:

### Keycloak Configuration

- **Realm**: Supplify
- **Web Client**: supplify-web (Public client with PKCE)
- **Gateway Client**: supplify-gateway (Confidential client)

### Custom Claims

The JWT tokens include custom claims for multi-tenancy:
- `client_id`: Organization identifier
- `org_type`: Organization type (restaurant, supplier, admin)
- `tier`: Subscription tier (basic, premium, enterprise)

## 📊 Features

### Core Modules

1. **Authentication** - Keycloak integration with multi-tenant context
2. **Feature Flags** - Global, tenant, and user-scoped flags
3. **Suppliers** - Supplier management and linking
4. **Orders** - Order lifecycle management
5. **Inventory** - Auto-sync inventory tracking
6. **Loyalty** - Points-based loyalty system
7. **Invoices** - Automated invoicing

### Multi-Tenancy

All data is strictly isolated by `clientId` with:
- Database-level isolation
- API-level tenant context middleware
- Frontend tenant-aware queries

## 🧪 Testing

### Smoke Tests

```bash
pnpm test:smoke
```

### E2E Tests

```bash
pnpm test:e2e
```

### All Tests

```bash
pnpm test:all
```

## 📁 Project Structure

```
supplify-v2/
├── apps/
│   ├── web/                 # Next.js frontend
│   └── api-gateway/         # NestJS backend
├── packages/
│   ├── auth-server/         # Authentication adapters
│   └── shared/              # Shared schemas and types
├── infra/
│   ├── keycloak/            # Keycloak configuration
│   └── db/                  # Database setup
└── tests/
    ├── smoke/               # API smoke tests
    └── e2e/                 # End-to-end tests
```

## 🔧 Development

### Environment Variables

Copy the example environment files:

```bash
# API Gateway
cp apps/api-gateway/env.example apps/api-gateway/.env

# Web App
cp apps/web/env.example apps/web/.env
```

### Database Schema

The database schema is managed by Prisma. Key models include:

- **Organization** - Multi-tenant organization data
- **User** - Keycloak user mapping
- **Supplier** - Supplier information
- **Product** - Product catalog
- **Order** - Order management
- **InventoryActivity** - Inventory tracking
- **FeatureFlag** - Feature flag configuration
- **LoyaltyWallet** - Loyalty points management

### API Endpoints

- `GET /health` - Health check
- `GET /auth/me` - Current user info
- `GET /flags` - Feature flags
- `POST /flags/toggle` - Toggle flags (admin)
- `GET /suppliers` - List suppliers
- `GET /orders` - List orders
- `GET /inventory/summary` - Inventory overview
- `GET /loyalty/summary` - Loyalty points

## 🚀 Deployment

### Production Build

```bash
pnpm build
```

### Docker Deployment

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml up -d
```

## 📝 Scripts

- `pnpm dev` - Start development servers
- `pnpm build` - Build all applications
- `pnpm typecheck` - TypeScript type checking
- `pnpm lint` - ESLint code linting
- `pnpm test:smoke` - Run smoke tests
- `pnpm test:e2e` - Run E2E tests
- `pnpm test:all` - Run all tests
- `pnpm keycloak:start` - Start Keycloak
- `pnpm keycloak:stop` - Stop Keycloak
- `pnpm db:migrate` - Run database migrations
- `pnpm db:generate` - Generate Prisma client

## 🤝 Contributing

1. Follow the established architecture patterns
2. Ensure all tests pass
3. Use TypeScript strict mode
4. Follow the multi-tenant data isolation rules
5. No mocks in runtime code

## 📄 License

Private - Supplify Internal Use Only
