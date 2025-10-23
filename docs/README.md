# Supplify Platform Documentation

Welcome to Supplify - the complete B2B food supply management platform.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- npm or pnpm
- Git

### One-Command Setup
```bash
# Windows (PowerShell)
.\start-platform.ps1

# Linux/macOS (Bash)
./start-platform.sh
```

### Manual Setup
```bash
# Install dependencies
npm install

# Start the platform
npm run dev
```

## 📚 Documentation Structure

### Core Documentation
- [Architecture Overview](./ARCHITECTURE.md) - System design and components
- [Deployment Guide](./DEPLOYMENT.md) - Production deployment instructions
- [API Documentation](./api/) - Complete API reference

### User Guides
- [Getting Started](./guides/getting-started.md) - First steps for new users
- [Authentication](./guides/authentication.md) - Login, signup, and user management
- [Role-Based Access](./guides/rbac.md) - Permissions and access control
- [Chat System](./guides/chat.md) - Real-time messaging features

### Feature Documentation
- [Test Data Management](./features/test-data.md) - Creating and managing test accounts
- [Promotions System](./features/promotions.md) - Campaign management and sponsored content
- [Subscriptions](./features/subscriptions.md) - Tier management and billing
- [Feature Flags](./features/feature-flags.md) - Toggle features on/off

### Development
- [Development Setup](./development/setup.md) - Local development environment
- [Contributing](./development/contributing.md) - How to contribute to the project
- [Testing](./development/testing.md) - Testing guidelines and practices

## 🎯 Key Features

### ✅ Completed Features
- **Multi-tenant Architecture** - Complete tenant isolation with `clientId`
- **User Management** - Individual signup/login for suppliers and restaurants
- **Real-time Chat** - Order-scoped and organization chat
- **Feature Flags** - Global and per-tenant feature toggling
- **Test Data System** - Automated test account generation
- **Role-Based Access Control** - Admin, supplier, restaurant roles
- **Subscription Management** - Tier-based access control
- **Promotions System** - Sponsored visibility and campaigns

### 🔄 In Progress
- **Order Management** - Complete order lifecycle
- **Inventory Management** - Stock tracking and management
- **Analytics Dashboard** - Business intelligence and reporting

## 🏗️ Architecture

Supplify is built with a modern microservices architecture:

- **Frontend**: Next.js 14 with React Query and Zustand
- **Backend**: NestJS microservices with GraphQL
- **Database**: PostgreSQL with Prisma ORM
- **Cache**: Redis for session and data caching
- **Real-time**: WebSocket and GraphQL subscriptions
- **Authentication**: AWS Cognito integration

## 🚀 Getting Started

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd supplify-core
   ```

2. **Start the platform**
   ```bash
   # Windows
   .\start-platform.ps1
   
   # Linux/macOS
   ./start-platform.sh
   ```

3. **Access the application**
   - Web App: http://localhost:3000
   - Admin Dashboard: http://localhost:3000/admin/dashboard
   - Test Data Manager: http://localhost:3000/admin/test-data

4. **Initialize test data**
   - Login as admin (`admin@supplify.com` / `admin123`)
   - Go to `/admin/test-data`
   - Click "Initialize Test Data"

## 📞 Support

For questions or issues:
- Create an issue in the repository
- Check the troubleshooting guide
- Review the FAQ section

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.