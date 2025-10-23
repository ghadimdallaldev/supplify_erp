# Contributing to Supplify

Thank you for your interest in contributing to Supplify! This document provides guidelines and instructions for contributing.

## Development Setup

1. **Prerequisites**
   - Node.js 20+
   - PNPM 8+
   - Docker & Docker Compose
   - Git

2. **Clone and Install**
   ```bash
   git clone https://github.com/your-org/supplify.git
   cd supplify
   pnpm install
   ```

3. **Start Infrastructure**
   ```bash
   cd infra/docker
   docker compose up -d
   ```

4. **Run Migrations**
   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

5. **Start Development**
   ```bash
   pnpm dev
   ```

## Code Standards

### TypeScript
- Use TypeScript strict mode
- No `any` types (use `unknown` if necessary)
- Proper type definitions for all functions
- Use interfaces for objects, types for unions

### Code Style
- ESLint and Prettier are configured
- Run `pnpm lint` before committing
- Run `pnpm format` to auto-format

### Git Workflow
1. Create a feature branch from `main`
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes with clear, atomic commits
   ```bash
   git commit -m "feat: add user authentication"
   ```

3. Follow [Conventional Commits](https://www.conventionalcommits.org/)
   - `feat:` New features
   - `fix:` Bug fixes
   - `docs:` Documentation changes
   - `refactor:` Code refactoring
   - `test:` Adding tests
   - `chore:` Maintenance tasks

4. Push and create a Pull Request
   ```bash
   git push origin feature/your-feature-name
   ```

### Pull Request Guidelines
- Provide a clear description of changes
- Reference any related issues
- Ensure all tests pass
- Update documentation if needed
- Add tests for new features
- Keep PRs focused and reasonably sized

## Testing

### Unit Tests
```bash
pnpm test
```

### E2E Tests
```bash
pnpm test:e2e
```

### Test Coverage
```bash
pnpm test:cov
```

## Architecture

### Services
- Each service is independent with its own database schema
- Communication via RabbitMQ (events) or direct HTTP/RPC
- Follow domain-driven design principles

### API Gateway
- Single entry point for frontend
- GraphQL and REST endpoints
- Handles authentication and routing

### Frontend
- Next.js 14 with App Router
- Server components where possible
- Client components for interactivity
- TailwindCSS for styling

## Database Migrations

When adding new models or changing schemas:

```bash
# Create migration
cd services/your-service
npx prisma migrate dev --name your_migration_name

# Apply migration
pnpm db:migrate
```

## Adding New Services

1. Create service directory in `services/`
2. Set up NestJS project structure
3. Add Prisma schema if needed
4. Create health check endpoint
5. Add RabbitMQ patterns
6. Update API Gateway to include service
7. Add documentation

## Documentation

- Document all public APIs
- Add JSDoc comments for complex functions
- Update README when adding features
- Keep architectural diagrams up to date

## Questions?

- Open an issue for bugs or feature requests
- Join our Discord for discussions
- Check existing issues before creating new ones

## License

By contributing, you agree that your contributions will be licensed under the project's MIT License.

