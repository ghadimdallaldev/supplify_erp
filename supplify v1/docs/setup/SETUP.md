# 🚀 Supplify Setup - Simple Guide

## ⚡ One-Command Setup

Run this script - it does EVERYTHING for you:

```bash
./setup-all.sh
```

**Or step-by-step:**

### 1. Install Dependencies
```bash
pnpm install
```

### 2. Generate Prisma Clients
```bash
./setup-prisma.sh
```

### 3. Start Docker Infrastructure
```bash
docker compose -f infra/docker/docker-compose.yml up -d
```

### 4. Start All Services
```bash
pnpm dev
```

---

## 🎯 Access the Platform

- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:4000/graphql
- **RabbitMQ Management**: http://localhost:15672
  - User: `supplify`
  - Pass: `supplify_dev_password`

---

## 🛠️ Troubleshooting

### Prisma errors?
```bash
./setup-prisma.sh
```

### Services won't start?
```bash
# Check Docker is running
docker ps

# Restart infrastructure
docker compose -f infra/docker/docker-compose.yml restart
```

### Port conflicts?
```bash
# Find and kill process on port 3000
lsof -ti:3000 | xargs kill -9  # Mac/Linux
netstat -ano | findstr :3000   # Windows (then taskkill /PID xxx /F)
```

---

## 📚 Full Documentation

See [docs/setup/QUICK_START.md](docs/setup/QUICK_START.md)


