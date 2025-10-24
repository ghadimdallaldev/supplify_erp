# Setup Environment Files for Supplify v2

Write-Host "🔧 Setting up environment files..." -ForegroundColor Yellow

# Create API Gateway .env file
$apiGatewayEnv = @"
# Database
DATABASE_URL="postgresql://supplify:supplify@localhost:5432/supplify?schema=public"

# Keycloak
KEYCLOAK_URL="http://localhost:8080"
KEYCLOAK_REALM="Supplify"
KEYCLOAK_CLIENT_ID="supplify-gateway"
KEYCLOAK_CLIENT_SECRET="gateway-secret"

# Redis
REDIS_URL="redis://localhost:6379"

# Server
PORT=4000
NODE_ENV="development"

# Logging
LOG_LEVEL="info"
"@

$apiGatewayEnv | Out-File -FilePath "apps/api-gateway/.env" -Encoding UTF8

# Create Web App .env file
$webAppEnv = @"
NEXT_PUBLIC_KEYCLOAK_URL=http://localhost:8080
NEXT_PUBLIC_KEYCLOAK_REALM=Supplify
NEXT_PUBLIC_KEYCLOAK_CLIENT_ID=supplify-web
NEXT_PUBLIC_API_URL=http://localhost:4000
"@

$webAppEnv | Out-File -FilePath "apps/web/.env" -Encoding UTF8

Write-Host "✅ Environment files created!" -ForegroundColor Green
Write-Host "📁 Created: apps/api-gateway/.env" -ForegroundColor White
Write-Host "📁 Created: apps/web/.env" -ForegroundColor White
