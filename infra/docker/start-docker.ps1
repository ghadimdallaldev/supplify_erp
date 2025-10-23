# Supplify Docker Startup Script
# Ensures Docker Desktop is running before starting services

Write-Host "🐋 Supplify Docker Startup Script" -ForegroundColor Cyan
Write-Host "=================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker Desktop is running
$dockerRunning = $false
try {
    docker version | Out-Null
    $dockerRunning = $true
    Write-Host "✅ Docker Desktop is running" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Desktop is not running" -ForegroundColor Red
}

# Start Docker Desktop if not running
if (-not $dockerRunning) {
    Write-Host ""
    Write-Host "🚀 Starting Docker Desktop..." -ForegroundColor Yellow
    
    $dockerPath = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerPath) {
        Start-Process $dockerPath
        Write-Host "⏳ Waiting for Docker to start (this may take 30-60 seconds)..." -ForegroundColor Yellow
        
        # Wait for Docker to be ready (max 2 minutes)
        $timeout = 120
        $elapsed = 0
        while ($elapsed -lt $timeout) {
            Start-Sleep -Seconds 5
            $elapsed += 5
            
            try {
                docker version | Out-Null
                Write-Host "✅ Docker Desktop is now running!" -ForegroundColor Green
                $dockerRunning = $true
                break
            } catch {
                Write-Host "⏳ Still waiting... ($elapsed seconds)" -ForegroundColor Gray
            }
        }
        
        if (-not $dockerRunning) {
            Write-Host "❌ Docker failed to start within $timeout seconds" -ForegroundColor Red
            Write-Host "Please start Docker Desktop manually and run this script again" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "❌ Docker Desktop not found at: $dockerPath" -ForegroundColor Red
        Write-Host "Please install Docker Desktop or update the path in this script" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""
Write-Host "🎯 Starting Supplify infrastructure..." -ForegroundColor Cyan

# Navigate to the docker directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Stop any existing containers
Write-Host "🛑 Stopping existing containers..." -ForegroundColor Yellow
docker compose -f docker-compose.yml down

# Pull latest images
Write-Host "📥 Pulling latest images..." -ForegroundColor Yellow
docker compose -f docker-compose.yml pull

# Start services
Write-Host "🚀 Starting services..." -ForegroundColor Cyan
docker compose -f docker-compose.yml up -d --build

# Check status
Write-Host ""
Write-Host "📊 Container Status:" -ForegroundColor Cyan
docker compose -f docker-compose.yml ps

Write-Host ""
Write-Host "✅ Supplify infrastructure is running!" -ForegroundColor Green
Write-Host ""
Write-Host "📌 Services:" -ForegroundColor Cyan
Write-Host "   PostgreSQL:   localhost:5432" -ForegroundColor White
Write-Host "   Redis:        localhost:6379" -ForegroundColor White
Write-Host "   RabbitMQ:     localhost:5672" -ForegroundColor White
Write-Host "   RabbitMQ UI:  http://localhost:15672 (user: supplify, pass: supplify_dev_password)" -ForegroundColor White
Write-Host "   LocalStack:   localhost:4566" -ForegroundColor White
Write-Host ""
Write-Host "🔍 View logs: docker compose -f infra/docker/docker-compose.yml logs -f" -ForegroundColor Gray
Write-Host "🛑 Stop all:  docker compose -f infra/docker/docker-compose.yml down" -ForegroundColor Gray
Write-Host ""

