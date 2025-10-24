# Supplify v2

A modern restaurant & F&B supplier marketplace built with React, Node.js, and PostgreSQL.

## Quick Start

1. **Install dependencies**
   ```bash
   pnpm install
   ```

2. **Start infrastructure**
   ```bash
   docker compose up -d
   ```

3. **Setup database**
   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

4. **Start development servers**
   ```bash
   pnpm dev
   ```

5. **Access the application**
   - Web App: http://localhost:5173
   - API: http://localhost:4000
   - Keycloak: http://localhost:8080
   - MinIO: http://localhost:9001

## Architecture

- **Frontend**: React + Vite + TypeScript + Tailwind + shadcn/ui
- **Backend**: Node.js + Express + JavaScript (ESM)
- **Database**: PostgreSQL with raw SQL and migrations
- **Authentication**: Keycloak OIDC with server-side token handling
- **Storage**: MinIO for file uploads
- **State Management**: RTK Query

## Development

### Available Scripts

- `pnpm dev` - Start both API and web development servers
- `pnpm build` - Build all applications
- `pnpm lint` - Lint all code
- `pnpm test` - Run all tests
- `pnpm db:migrate` - Run database migrations
- `pnpm db:seed` - Seed database with sample data
- `pnpm db:reset` - Reset database (drop, migrate, seed)
- `pnpm openapi:gen` - Generate OpenAPI client for web app

### Environment Setup

Copy the example environment files and configure:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

## Authentication

The application uses Keycloak for authentication with server-side OIDC flow:

1. User visits `/auth/login`
2. Server redirects to Keycloak
3. User authenticates with Keycloak
4. Keycloak redirects to `/auth/callback`
5. Server exchanges code for tokens and sets HTTP-only cookies
6. User is redirected to the application

## Database

The application uses PostgreSQL with a custom migration system:

- Migrations are stored in `apps/api/db/migrations/`
- Each migration is a timestamped SQL file
- Run migrations with `pnpm db:migrate`
- Seed data with `pnpm db:seed`

## API

The API follows RESTful conventions with:

- Response envelope format: `{ ok: boolean, data: any, error: any, requestId: string }`
- Role-based access control (RBAC)
- Audit logging for all operations
- Input validation with Zod
- Rate limiting and CSRF protection

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT
