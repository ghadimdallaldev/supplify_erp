# Supplify v2 Setup Script for Windows

Write-Host "🚀 Setting up Supplify v2..." -ForegroundColor Green

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
pnpm install

# Start infrastructure
Write-Host "🏗️ Starting infrastructure..." -ForegroundColor Yellow
pnpm keycloak:start

# Wait for Keycloak to be ready
Write-Host "⏳ Waiting for Keycloak to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# Start database
Write-Host "🗄️ Starting database..." -ForegroundColor Yellow
Set-Location infra/db
docker compose up -d
Set-Location ../..

# Wait for database to be ready
Write-Host "⏳ Waiting for database to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Setup database
Write-Host "🗄️ Setting up database..." -ForegroundColor Yellow
pnpm db:generate
pnpm db:migrate

Write-Host "✅ Setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "🌐 Access the application:" -ForegroundColor Cyan
Write-Host "  Web App: http://localhost:3000" -ForegroundColor White
Write-Host "  API Gateway: http://localhost:4000" -ForegroundColor White
Write-Host "  API Docs: http://localhost:4000/api/docs" -ForegroundColor White
Write-Host "  Keycloak Admin: http://localhost:8080 (admin/admin)" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Start development servers with: pnpm dev" -ForegroundColor Cyan
