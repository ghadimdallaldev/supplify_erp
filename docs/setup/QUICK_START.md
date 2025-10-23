# 🚀 Supplify - Quick Start Guide

## Run Everything at Once!

You have **3 ways** to start the entire platform with a single command:

---

## ⚡ Method 1: Simple pnpm Command (Recommended)

### Windows
```powershell
# One-time setup
pnpm install
pnpm install concurrently -w

# Start infrastructure + all services
.\start.ps1
```

### Linux/Mac
```bash
# One-time setup
pnpm install

# Make script executable
chmod +x start.sh

# Start infrastructure + all services
./start.sh
```

**What it does:**
- ✅ Checks prerequisites (Docker, pnpm, Node.js)
- ✅ Starts Docker infrastructure (PostgreSQL, Redis, RabbitMQ, Elasticsearch)
- ✅ Waits for all services to be ready
- ✅ Generates Prisma clients
- ✅ Starts all 17 microservices + frontend concurrently

**Press `Ctrl+C` to stop all services**

---

## 🔧 Method 2: PM2 Process Manager (Advanced)

PM2 provides better process management with auto-restart, logs, and monitoring.

### Install PM2
```bash
npm install -g pm2
```

### Start Everything
```bash
# Start infrastructure first
pnpm dev:infra

# Wait 30 seconds for infrastructure to be ready

# Start all services with PM2
pm2 start ecosystem.config.js
```

### Manage Services
```bash
# View all services
pm2 list

# View logs
pm2 logs

# View logs for specific service
pm2 logs web
pm2 logs api-gateway

# Restart all
pm2 restart all

# Restart specific service
pm2 restart chat

# Stop all
pm2 stop all

# Delete all (stop and remove)
pm2 delete all

# Monitor (real-time dashboard)
pm2 monit
```

---

## 🎯 Method 3: Manual Step-by-Step

If you prefer more control:

### 1. Start Infrastructure
```bash
pnpm dev:infra
# Starts: PostgreSQL, Redis, RabbitMQ, Elasticsearch, LocalStack
```

### 2. Start All Services
```bash
# Option A: All services + frontend
pnpm dev

# Option B: Backend only
pnpm dev:backend

# Option C: Frontend only (in separate terminal)
pnpm dev:frontend
```

---

## 📍 Service Ports

Once started, access services at:

| Service | URL | Description |
|---------|-----|-------------|
| **Frontend** | http://localhost:3000 | Main web app |
| **API Gateway** | http://localhost:4000 | GraphQL API |
| **Catalog** | http://localhost:3001 | Products service |
| **Orders** | http://localhost:3002 | Orders service |
| **Restaurants** | http://localhost:3003 | Restaurants service |
| **Suppliers** | http://localhost:3004 | Suppliers service |
| **Loyalty** | http://localhost:3005 | Loyalty service |
| **Recommendations** | http://localhost:3006 | Recommendations service |
| **Notifications** | http://localhost:3007 | Notifications service |
| **Analytics** | http://localhost:3008 | Analytics service |
| **Inventory** | http://localhost:3009 | Inventory service |
| **Auth Proxy** | http://localhost:3010 | Auth service |
| **Chat** | http://localhost:3011 | Chat service (WebSocket) |
| **Search** | http://localhost:3012 | Search service |
| **Invoicing** | http://localhost:3013 | Invoicing service |
| **Subscriptions** | http://localhost:3014 | Subscriptions service |
| **Promotions** | http://localhost:3015 | Promotions service |
| **Flags** | http://localhost:3016 | Feature flags service |

### Infrastructure
| Service | URL | Credentials |
|---------|-----|-------------|
| **PostgreSQL** | localhost:5432 | user: `supplify` / pass: `supplify_dev_password` |
| **Redis** | localhost:6379 | No auth |
| **RabbitMQ Management** | http://localhost:15672 | user: `supplify` / pass: `supplify_dev_password` |
| **Elasticsearch** | http://localhost:9200 | No auth |
| **LocalStack (S3)** | http://localhost:4566 | key: `test` / secret: `test` |

---

## 🛠️ Common Commands

### Installation
```bash
# Install all dependencies
pnpm install:all

# Generate Prisma clients
pnpm -r --filter './services/*' prisma generate
```

### Database
```bash
# Run all migrations
pnpm migrate:all

# Seed all databases
pnpm seed:all

# Reset a specific service database
cd services/catalog
pnpm prisma migrate reset
```

### Build
```bash
# Build everything (production)
pnpm build

# Build specific service
pnpm --filter @supplify/catalog build
```

### Testing
```bash
# Run all tests
pnpm test

# Run tests for specific service
pnpm --filter @supplify/catalog test
```

### Cleanup
```bash
# Clean all node_modules and build artifacts
pnpm clean

# Stop infrastructure
pnpm stop:infra

# Restart infrastructure
pnpm stop:infra && pnpm dev:infra
```

---

## ✅ Health Checks

After starting, verify all services are running:

```bash
# Check all health endpoints
curl http://localhost:3001/health  # Catalog
curl http://localhost:3002/health  # Orders
curl http://localhost:3003/health  # Restaurants
# ... and so on for all services

# Or use this one-liner (PowerShell)
3001,3002,3003,3004,3005,3006,3007,3008,3009,3010,3011,3012,3013,3014,3015,3016 | ForEach-Object { 
    Write-Host "Port $_: " -NoNewline
    try { 
        $response = Invoke-WebRequest -Uri "http://localhost:$_/health" -UseBasicParsing -TimeoutSec 2
        Write-Host "✅ OK" -ForegroundColor Green
    } catch { 
        Write-Host "❌ DOWN" -ForegroundColor Red
    }
}
```

---

## 🐛 Troubleshooting

### Services won't start
```bash
# Check if ports are already in use
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # Mac/Linux

# Kill process on port
taskkill /PID <PID> /F        # Windows
kill -9 <PID>                 # Mac/Linux
```

### Docker containers not starting
```bash
# Check Docker is running
docker ps

# View logs
docker compose -f infra/docker/docker-compose.yml logs

# Restart infrastructure
docker compose -f infra/docker/docker-compose.yml restart

# Nuclear option (deletes all data!)
docker compose -f infra/docker/docker-compose.yml down -v
docker compose -f infra/docker/docker-compose.yml up -d
```

### Prisma errors
```bash
# Regenerate clients
pnpm -r --filter './services/*' prisma generate

# Reset database (WARNING: deletes all data)
cd services/catalog
pnpm prisma migrate reset
```

### Out of memory
```bash
# Increase Node.js memory limit
export NODE_OPTIONS="--max-old-space-size=4096"  # Mac/Linux
$env:NODE_OPTIONS="--max-old-space-size=4096"   # Windows PowerShell

# Or reduce number of concurrent services by starting in batches
```

---

## 🎯 Development Workflow

### Typical workflow:
1. Start infrastructure: `pnpm dev:infra`
2. Start services: `pnpm dev` or `pm2 start ecosystem.config.js`
3. Open browser: http://localhost:3000
4. Make changes (hot reload enabled)
5. View logs in terminal or `pm2 logs`
6. Stop: Press `Ctrl+C` or `pm2 stop all`

### Working on a single service:
```bash
# Start infrastructure + all services
pnpm dev

# In another terminal, work on specific service
cd services/catalog
# Edit files, they will hot-reload
```

---

## 🚀 Production Build

```bash
# Build everything
pnpm build

# Start in production mode
NODE_ENV=production pnpm start

# Or use PM2 with production config
pm2 start ecosystem.config.js --env production
```

---

## 📚 More Documentation

- `README.md` - Overview
- `WINDOWS_SETUP.md` - Windows-specific setup
- `PHASE_2_SETUP_GUIDE.md` - Phase 2 features setup
- `🚀_START_HERE_SUPPLIFY_MASTER_GUIDE.md` - Complete guide

---

## 🎉 You're Ready!

Run `./start.ps1` (Windows) or `./start.sh` (Mac/Linux) and your entire platform starts! 🚀

