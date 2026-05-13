# Supplify

A modern restaurant & F&B supplier marketplace built with React, Node.js, and PostgreSQL.

## Quick Start (native dev — recommended for coding)

Hot reload without rebuilding Docker images:

```cmd
pnpm setup
pnpm dev
```

- **Web:** http://localhost:5173 (Vite HMR)
- **API:** http://localhost:4000 (`node --watch`)
- **Infra:** Postgres, Redis, MinIO, Keycloak stay in Docker (`pnpm local:infra` starts them once)

After code changes, save the file — no `docker compose build` needed.

`pnpm dev` enables **pnpm via corepack** if missing, syncs `apps/api/.env` from `docker/.env`, runs migrations, then starts API + web.

## Quick Start (full Docker stack)

One command from the repo root (Windows CMD, PowerShell, or Git Bash):

```cmd
scripts\run-local.cmd up
```

This starts Postgres, Redis, MinIO, Keycloak, nginx, API, and web. The app is at **http://localhost** (nginx fronts everything). API logs stream by default; use `--no-logs` to detach.

Bootstrap database + demo users:

```cmd
scripts\run-local.cmd seed
```

| Command | Purpose |
|---------|---------|
| `scripts\run-local.cmd up` | Start stack + tail API logs |
| `scripts\run-local.cmd dev` | Same as `pnpm dev` (infra + native API/web) |
| `scripts\run-local.cmd infra` | Docker infra only (no API/web images) |
| `scripts\run-local.cmd down` | Stop stack |
| `scripts\run-local.cmd ps` | Container status + HTTP health checks |

**Demo logins** (after seed): `restaurant@supplify.com`, `supplier@supplify.com`, `admin@supplify.com` — passwords from `apps/api/scripts/seed-demo-users.js`.

**Keycloak admin**: http://localhost:8180/admin (`admin` / `admin`, master realm). App realm: **Supplify**.

## Quick Start (native dev)

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Start infrastructure**

   ```bash
   docker compose up -d postgres redis minio keycloak
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

5. **Access**
   - Web (Vite dev): http://localhost:5173
   - API: http://localhost:4000
   - Full stack via nginx: http://localhost

## Architecture

- **Frontend**: React + Vite + TypeScript + Tailwind + shadcn/ui
- **Backend**: Node.js + Express + JavaScript (ESM)
- **Database**: PostgreSQL with numbered SQL migrations (`apps/api/db/migrations/`)
- **Authentication**: Keycloak OIDC; browser uses `KEYCLOAK_PUBLIC_URL`, API uses internal `KEYCLOAK_BASE_URL`
- **Storage**: MinIO for file uploads
- **Proxy**: nginx on port 80 — `/` → web, `/api/*` and `/auth/*` → API
- **FOH**: Reservations cockpit (floor plan, board, guest flow)
- **Labour**: Staff app (directory, shifts, time clock, PTO, swaps)

## Feature areas

| Area | API prefix | Notes |
|------|------------|--------|
| Orders | `/api/orders` | Placement, status, reminders, calendar |
| Chat | `/api/chat` | Conversations, messages, Socket.IO |
| Reservations | `/api/reservations` | Tables, board, bookings |
| Staff / shifts | `/api/staff` | Members, shifts, time entries |
| Admin | `/api/admin-dashboard` | Plans, limits, impersonation, **feature toggles** |

Subscription **plans** define default features; admins can override globally or per tenant — see [admin-feature-flags.md](./admin-feature-flags.md).

## Documentation

- [Database migrations](./database-migrations.md) — running, troubleshooting, fresh DB
- [Admin feature toggles](./admin-feature-flags.md) — global and per-tenant flags
- [Deploy](../deploy/README.md) — production Docker on EC2
- [Tests](../tests/README.md) — unit and E2E

## Development

### Available Scripts

- `pnpm dev` - Start both API and web development servers
- `pnpm build` - Build all applications
- `pnpm typecheck` - Type check TypeScript code
- `pnpm lint` - Lint all code
- `pnpm lint:fix` - Fix linting issues automatically
- `pnpm format` - Format code with Prettier
- `pnpm test` - Run all tests in watch mode
- `pnpm test:ci` - Run all tests once (for CI)
- `pnpm e2e` - Run end-to-end tests
- `pnpm db:migrate` - Run database migrations (SQL + runtime schema checks)
- `pnpm db:seed` - Seed database with sample data
- `pnpm db:reset` - Reset database (drop, migrate, seed)
- `pnpm openapi:gen` - Generate OpenAPI client for web app

### Environment Setup

Copy the example environment files and configure:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

For Docker, root `.env` is created automatically by `run-local.cmd` from defaults.

## Authentication

The application uses Keycloak for authentication with server-side OIDC flow:

1. User visits `/auth/login`
2. Server redirects to Keycloak (public URL, e.g. `http://localhost:8180`)
3. User authenticates with Keycloak
4. Keycloak redirects to `/auth/callback`
5. Server exchanges code for tokens and sets HTTP-only cookies
6. User is redirected to the application

## Database

- Migrations: `apps/api/db/migrations/*.sql` (tracked in `schema_migrations`)
- Runner: `apps/api/scripts/run-migration.js`
- See [database-migrations.md](./database-migrations.md) for troubleshooting

## API

The API follows RESTful conventions with:

- Response envelope: `{ ok, data, error, requestId }`
- Role-based access control (RBAC) and subscription `requireFeature` gates
- Audit logging for admin operations
- Input validation with Zod
- Rate limiting and CSRF protection

## CI/CD Automation

This repository uses GitHub Actions for automated CI/CD workflows.

### PR Flow

Every pull request automatically triggers:

1. **Type Checking** - Validates TypeScript types in the web app
2. **Linting** - Runs ESLint on both API and web code
3. **Testing** - Executes unit tests for both API and web
4. **Build** - Verifies that both applications build successfully

All checks must pass before a PR can be merged.

### Conventional Commits

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for semantic versioning. Commit messages must follow the format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks
- `perf`: Performance improvements
- `ci`: CI/CD changes
- `build`: Build system changes

**Example:**

```
feat(auth): add OAuth2 login support

Add support for OAuth2 authentication flow with Keycloak.
Includes token refresh and logout functionality.

Closes #123
```

Commitlint will automatically validate commit messages on commit using Husky.

### Automatic Release

When code is merged into `main`, semantic-release automatically:

1. Analyzes commits since the last release
2. Determines the version bump (patch, minor, or major)
3. Generates release notes from commit messages
4. Updates `CHANGELOG.md`
5. Creates a Git tag for the new version
6. Creates a GitHub release

**No manual version bumping required!** The version is determined automatically based on commit types:

- `feat`: minor version bump
- `fix`: patch version bump
- `BREAKING CHANGE`: major version bump

### Deployment Trigger

Tagged releases (e.g., `v1.2.3`) automatically trigger deployment:

- **API**: Deploys to AWS ECS using OIDC authentication (no static secrets)
- **Web**: Deploys to Vercel (if configured)

Deployment requires:

- AWS OIDC role configured (for API deployment)
- Vercel tokens configured (for web deployment)

### Running Tests Locally

To run tests locally before pushing:

```bash
# Run all tests
pnpm test

# Run tests once (CI mode)
pnpm test:ci

# Run E2E tests
pnpm e2e

# Run tests with coverage
pnpm --filter @supplify/api test:coverage
pnpm --filter @supplify/web test:coverage
```

### Workflow Files

- `.github/workflows/ci.yml` - Runs on every PR and push to main/develop
- `.github/workflows/release.yml` - Runs semantic-release on main branch
- `.github/workflows/deploy.yml` - Deploys to production on tagged releases

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes following Conventional Commit format
4. Run tests and linting locally: `pnpm test:ci && pnpm lint`
5. Commit your changes (commitlint will validate the message)
6. Submit a pull request
7. Ensure all CI checks pass before requesting review

## License

MIT
