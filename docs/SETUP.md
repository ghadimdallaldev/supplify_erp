# Supplify v2

A modern restaurant & F&B supplier marketplace built with React, Node.js, and PostgreSQL.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- pnpm 8+
- Docker & Docker Compose

### 1. Clone and Install

```bash
git clone <repository-url>
cd supplify-v2
pnpm install
```

### 2. Environment Setup

```bash
# Copy environment files
cp apps/api/env.example apps/api/.env
cp apps/web/env.example apps/web/.env

# Edit the .env files with your configuration
```

### 3. Start Infrastructure

```bash
docker compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Keycloak (port 8080) 
- MinIO (port 9000, console 9001)

### 4. Database Setup

```bash
# Run migrations
pnpm db:migrate

# Seed with sample data
pnpm db:seed
```

**Optional: Prodlike seed (full dataset + login accounts)**  
For a rich dev dataset (invoices, orders, inventories, reservations, quick lists) and Keycloak accounts for every restaurant/supplier, see [SEED_PRODLIKE.md](SEED_PRODLIKE.md). From repo root:

```bash
ALLOW_PRODLIKE_SEED=true pnpm run seed:prodlike
pnpm run seed:accounts    # Keycloak logins for all tenants (password: Supplify1!)
pnpm run seed:quick-lists # Quick lists for all restaurants
```

### 5. Start Development Servers

```bash
# Start both API and web app
pnpm dev

# Or start individually
pnpm --filter @supplify/api dev
pnpm --filter @supplify/web dev
```

### 6. Access the Application

- **Web App**: http://localhost:5173
- **API**: http://localhost:4000
- **Keycloak Admin**: http://localhost:8080 (admin/admin)
- **MinIO Console**: http://localhost:9001 (minioadmin/minioadmin)

## 🏗️ Architecture

### Tech Stack

- **Frontend**: React 18 + Vite + TypeScript + Tailwind + shadcn/ui
- **Backend**: Node.js + Express + JavaScript (ESM)
- **Database**: PostgreSQL with raw SQL and migrations
- **Authentication**: Keycloak OIDC with server-side token handling
- **Storage**: MinIO for file uploads
- **State Management**: RTK Query
- **Styling**: Tailwind CSS + shadcn/ui components

### Project Structure

```
supplify-v2/
├── apps/
│   ├── api/                 # Node.js API server
│   │   ├── src/
│   │   │   ├── config/     # Environment configuration
│   │   │   ├── lib/        # Database, auth, utilities
│   │   │   ├── middlewares/# Express middlewares
│   │   │   └── routes/     # API route handlers
│   │   ├── db/
│   │   │   ├── migrations/ # SQL migration files
│   │   │   └── seed/       # Seed data
│   │   └── scripts/        # Migration and utility scripts
│   └── web/                # React web application
│       ├── src/
│       │   ├── components/ # React components
│       │   ├── features/   # Redux slices
│       │   ├── pages/      # Page components
│       │   ├── services/   # RTK Query API
│       │   └── types/      # TypeScript types
│       └── public/         # Static assets
├── infra/                  # Infrastructure configuration
│   ├── db/                 # Database setup
│   └── keycloak/          # Keycloak realm configuration
└── .github/workflows/     # CI/CD pipelines
```

## 🔐 Authentication

The application uses Keycloak for authentication with server-side OIDC flow:

1. User visits `/auth/login`
2. Server redirects to Keycloak
3. User authenticates with Keycloak
4. Keycloak redirects to `/auth/callback`
5. Server exchanges code for tokens and sets HTTP-only cookies
6. User is redirected to the application

### Demo Accounts (Keycloak login only)

| Role        | Email                   | Password            |
|------------|-------------------------|---------------------|
| **Admin**  | admin@supplify.com      | SupplifyAdmin1!     |
| **Supplier**  | supplier@supplify.com | SupplifySupplier1!  |
| **Restaurant** | restaurant@supplify.com | SupplifyRestaurant1! |

Sign in via **Sign in with Keycloak** on the login page. Keycloak must be running (`docker-compose up -d`). Keycloak imports the realm only on first start. If **admin** or **supplier** login fails (wrong role or redirect back to login), recreate Keycloak so it re-imports the realm: `docker-compose up -d --force-recreate keycloak`. If the realm already existed, you may need to reset the Keycloak database (e.g. remove the `keycloak` DB in Postgres and run `infra/db/init.sql` again) so the next Keycloak start re-imports. The app also assigns admin/supplier role by demo email when the token has no roles.

## 🗄️ Database

The application uses PostgreSQL with a custom migration system:

- Migrations are stored in `apps/api/db/migrations/`
- Each migration is a timestamped SQL file
- Run migrations with `pnpm db:migrate`
- Seed data with `pnpm db:seed`

### Key Tables

- `app_user` - User accounts linked to Keycloak
- `supplier` - Supplier companies
- `restaurant` - Restaurant companies  
- `product` - Product catalog
- `price` - Product pricing
- `inventory` - Stock levels
- `customer_order` - Orders placed by restaurants
- `order_item` - Individual items in orders

## 🔌 API

The API follows RESTful conventions with:

- Response envelope format: `{ ok: boolean, data: any, error: any, requestId: string }`
- Role-based access control (RBAC)
- Audit logging for all operations
- Input validation with Zod
- Rate limiting and CSRF protection

### Key Endpoints

- `GET /auth/me` - Get current user info
- `GET /api/products` - List products with filters
- `POST /api/orders` - Create new order
- `GET /api/orders` - List orders (role-aware)
- `GET /api/admin/dashboard` - Dashboard statistics

## 🛠️ Development

### Available Scripts

- `pnpm dev` - Start both API and web development servers
- `pnpm build` - Build all applications
- `pnpm lint` - Lint all code
- `pnpm test` - Run all tests
- `pnpm db:migrate` - Run database migrations
- `pnpm db:seed` - Seed database with sample data
- `pnpm db:reset` - Reset database (drop, migrate, seed)

### Environment Variables

#### API (.env)
```bash
PORT=4000
WEB_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/supplify
KEYCLOAK_BASE_URL=http://localhost:8080
KEYCLOAK_REALM=Supplify
KEYCLOAK_CLIENT_ID=supplify-api
KEYCLOAK_CLIENT_SECRET=changeme
SESSION_SECRET=supersecret
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=supplify
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
NODE_ENV=development
```

#### Web (.env)
```bash
VITE_API_URL=http://localhost:4000
```

## 🧪 Testing

```bash
# Run all tests
pnpm test

# Run API tests only
pnpm --filter @supplify/api test

# Run web tests only  
pnpm --filter @supplify/web test

# Run tests in watch mode
pnpm --filter @supplify/api test:watch
```

## 🚀 Deployment

### Production Build

```bash
pnpm build
```

### Docker Deployment

```bash
# Build production images
docker build -t supplify-api apps/api
docker build -t supplify-web apps/web

# Run with docker-compose.prod.yml
docker compose -f docker-compose.prod.yml up -d
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Write tests for new features
- Update documentation as needed
- Use conventional commit messages
- Ensure all tests pass before submitting PR

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

If you encounter any issues:

1. Check the [Issues](https://github.com/your-org/supplify-v2/issues) page
2. Create a new issue with detailed information
3. Contact the development team

## 🔄 Changelog

### v2.0.0
- Complete rewrite with modern tech stack
- Server-side Keycloak authentication
- Raw PostgreSQL with migrations
- React + Vite frontend
- RTK Query for state management
- Comprehensive RBAC system
- Audit logging
- File upload with MinIO
- CI/CD pipeline
