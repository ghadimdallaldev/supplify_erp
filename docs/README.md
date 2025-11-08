# Supplify

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
- **FOH Experience**: Reservations cockpit with drag-and-drop status board, full-width floor builder, and guest flow analytics
- **Labour Management**: Staff App delivering team directory, shift scheduling, and time clock flows (single-location focus)

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

## Staff App Snapshot

Supplify now bundles a lightweight Staff App tailored for single-location restaurants:

- **Directory** – maintain active/inactive staff with wage context and hire dates.
- **Scheduling** – create shifts with assigned roles, view upcoming coverage, and keep notes.
- **Time Clock** – browser-based check-in/out with break capture and audit-friendly time entries.
- **Progressive Phases** – PTO, swaps, announcements, documents, and payroll exports build on this foundation.

All data lives under the restaurant tenant so it’s ready for multi-location expansion in later phases.

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
