#!/bin/bash

# Database setup script for Supplify
# This script sets up the database and runs migrations

echo "🚀 Setting up Supplify Database..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL environment variable is not set"
    echo "Please set DATABASE_URL in your .env file"
    echo "Example: DATABASE_URL=postgresql://username:password@localhost:5432/supplify"
    exit 1
fi

# Navigate to database service directory
cd services/database

echo "📦 Installing dependencies..."
npm install

echo "🔄 Generating Prisma client..."
npx prisma generate

echo "🗄️ Running database migrations..."
npx prisma migrate dev --name init

echo "🌱 Seeding initial data..."
npx prisma db seed

echo "✅ Database setup complete!"
echo ""
echo "Next steps:"
echo "1. Update your .env files with DATABASE_URL"
echo "2. Start the services: npm run dev"
echo "3. Access the admin panel: http://localhost:3000/admin/feature-flags"
