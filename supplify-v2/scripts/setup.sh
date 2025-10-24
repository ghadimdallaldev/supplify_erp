#!/bin/bash

echo "🚀 Setting up Supplify v2..."

# Install dependencies
echo "📦 Installing dependencies..."
pnpm install

# Start infrastructure
echo "🏗️ Starting infrastructure..."
pnpm keycloak:start

# Wait for Keycloak to be ready
echo "⏳ Waiting for Keycloak to be ready..."
sleep 30

# Start database
echo "🗄️ Starting database..."
cd infra/db && docker compose up -d && cd ../..

# Wait for database to be ready
echo "⏳ Waiting for database to be ready..."
sleep 10

# Setup database
echo "🗄️ Setting up database..."
pnpm db:generate
pnpm db:migrate

echo "✅ Setup complete!"
echo ""
echo "🌐 Access the application:"
echo "  Web App: http://localhost:3000"
echo "  API Gateway: http://localhost:4000"
echo "  API Docs: http://localhost:4000/api/docs"
echo "  Keycloak Admin: http://localhost:8080 (admin/admin)"
echo ""
echo "🚀 Start development servers with: pnpm dev"
