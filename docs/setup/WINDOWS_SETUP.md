# Windows Setup Guide for Supplify

## Prerequisites

### 1. Install Node.js 20+

Download and install from: https://nodejs.org/

Verify installation:
```powershell
node --version
npm --version
```

### 2. Install PNPM

**Recommended method:**
```powershell
npm install -g pnpm
```

**Alternative (PowerShell):**
```powershell
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

Verify installation:
```powershell
pnpm --version
```

### 3. Install Docker Desktop for Windows

Download from: https://www.docker.com/products/docker-desktop/

After installation:
1. Enable WSL 2 backend (recommended)
2. Start Docker Desktop
3. Verify: `docker --version`

### 4. Install Git for Windows

Download from: https://git-scm.com/download/win

## Quick Start

### Step 1: Clone and Install Dependencies

```powershell
# Navigate to project directory
cd "C:\Users\different\Desktop\Supplify\Supplify Core"

# Install dependencies
pnpm install
```

### Step 2: Start Infrastructure

```powershell
# Navigate to docker directory
cd infra\docker

# Start all services
docker compose up -d

# Verify services are running
docker compose ps
```

Expected services:
- PostgreSQL (port 5432)
- Redis (port 6379)
- RabbitMQ (ports 5672, 15672)
- LocalStack (port 4566)

### Step 3: Set Up Environment

```powershell
# Copy environment template
copy env.template .env

# Edit .env with your preferred editor
notepad .env
```

**Minimum required variables:**
```env
NODE_ENV=development
DATABASE_URL=postgresql://supplify:supplify_dev_password@localhost:5432/supplify
REDIS_URL=redis://localhost:6379
RABBITMQ_URL=amqp://supplify:supplify_dev_password@localhost:5672
AWS_REGION=eu-central-1
AWS_ENDPOINT=http://localhost:4566
AWS_ACCESS_KEY_ID=test
AWS_SECRET_ACCESS_KEY=test
S3_BUCKET=supplify-assets-dev
```

### Step 4: Database Setup

```powershell
# Run migrations for all services
pnpm db:migrate

# Seed demo data
pnpm db:seed
```

### Step 5: Start Development Servers

**Option A: Start all services**
```powershell
pnpm dev
```

**Option B: Start services individually**

Open separate PowerShell windows for each:

```powershell
# Terminal 1: API Gateway
pnpm --filter @supplify/api-gateway dev

# Terminal 2: Web App
pnpm --filter @supplify/web dev

# Terminal 3: Catalog Service
pnpm --filter @supplify/catalog dev

# Terminal 4: Orders Service
pnpm --filter @supplify/orders dev

# Add more as needed...
```

### Step 6: Access the Platform

Open your browser:
- **Web App**: http://localhost:3000
- **API Gateway GraphQL**: http://localhost:4000/graphql
- **RabbitMQ Management**: http://localhost:15672 (guest/guest)

## Troubleshooting

### Issue: "pnpm: command not found"

**Solution:**
1. Close all terminal windows
2. Reopen PowerShell as Administrator
3. Run: `npm install -g pnpm`
4. Restart your terminal

### Issue: Docker services won't start

**Solution:**
1. Ensure Docker Desktop is running
2. Check if ports are available:
   ```powershell
   netstat -ano | findstr "5432"
   netstat -ano | findstr "6379"
   netstat -ano | findstr "5672"
   ```
3. Stop conflicting services if needed

### Issue: Database connection errors

**Solution:**
1. Verify Docker containers are running:
   ```powershell
   docker compose ps
   ```
2. Check PostgreSQL logs:
   ```powershell
   docker compose logs postgres
   ```
3. Try restarting services:
   ```powershell
   docker compose restart
   ```

### Issue: Port already in use

**Solution:**
1. Find process using the port:
   ```powershell
   netstat -ano | findstr "3000"
   ```
2. Kill the process:
   ```powershell
   taskkill /PID <process_id> /F
   ```

### Issue: WSL 2 installation required for Docker

**Solution:**
1. Enable WSL 2:
   ```powershell
   wsl --install
   ```
2. Restart your computer
3. Set WSL 2 as default:
   ```powershell
   wsl --set-default-version 2
   ```

## Windows-Specific Notes

### Path Separators
- Use backslashes `\` in Windows paths
- Or forward slashes `/` work in most cases

### Scripts
Some npm scripts might need adjustments for Windows:
- Use `cross-env` for environment variables
- Replace Unix commands with Windows equivalents

### Line Endings
Git might convert line endings. Configure:
```powershell
git config --global core.autocrlf true
```

## PowerShell Tips

### Run as Administrator
Right-click PowerShell → "Run as Administrator"

### Set Execution Policy (if needed)
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### Multiple Terminals
Use Windows Terminal for better experience:
- Install from Microsoft Store
- Supports tabs and split panes

## Development Workflow

### Daily Startup

1. **Start Docker Desktop**
2. **Start Infrastructure:**
   ```powershell
   cd infra\docker
   docker compose up -d
   ```
3. **Start Dev Servers:**
   ```powershell
   pnpm dev
   ```

### Daily Shutdown

1. **Stop Dev Servers:** `Ctrl+C` in terminals
2. **Stop Infrastructure:**
   ```powershell
   docker compose down
   ```

## IDE Setup

### VS Code (Recommended)

Install extensions:
- ESLint
- Prettier
- Prisma
- Docker
- GitLens

**Settings (`.vscode/settings.json`):**
```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  }
}
```

## Testing

### Run Tests
```powershell
# All tests
pnpm test

# E2E tests
pnpm test:e2e

# Specific service
pnpm --filter @supplify/catalog test
```

## Building for Production

```powershell
# Build all
pnpm build

# Build specific app
pnpm --filter @supplify/web build
```

## Common Commands Cheat Sheet

```powershell
# Install dependencies
pnpm install

# Add dependency to workspace
pnpm add <package> -w

# Add dependency to specific service
pnpm add <package> --filter @supplify/catalog

# Clean all
pnpm clean

# Lint
pnpm lint

# Type check
pnpm typecheck

# Format code
pnpm format

# Database
pnpm db:migrate
pnpm db:seed

# Docker
docker compose up -d
docker compose down
docker compose ps
docker compose logs -f
```

## Getting Help

- Check main README.md
- Review CONTRIBUTING.md
- Check service-specific README files
- Review error logs in `docker compose logs`

## Next Steps

1. ✅ Complete setup above
2. 📖 Read `docs/ARCHITECTURE.md`
3. 🎨 Explore the web app at http://localhost:3000
4. 🔧 Try the GraphQL playground at http://localhost:4000/graphql
5. 📊 Check RabbitMQ dashboard at http://localhost:15672

Happy coding! 🚀

