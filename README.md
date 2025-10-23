# Supplify - B2B Food Supply Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?logo=postgresql&logoColor=white)](https://www.postgresql.org/)

A comprehensive B2B food supply platform connecting restaurants with suppliers, featuring real-time inventory management, order processing, analytics, and communication tools.

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- pnpm package manager
- PostgreSQL 14+
- RabbitMQ 3.8+
- Redis 6+

### Installation

```bash
# Clone the repository
git clone https://github.com/supplify/platform.git
cd platform

# Install dependencies
pnpm install

# Setup environment
cp env.template .env
# Edit .env with your configuration

# Setup database
pnpm run db:setup

# Start the platform
pnpm run dev
```

The platform will be available at:
- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:3001
- **Services**: Various ports (see [Services](#services))

## 📋 Features

### 🛒 Order Management
- **Multi-supplier ordering** from a single platform
- **Real-time order tracking** with status updates
- **SLA management** with automatic acknowledgments
- **Order history** and analytics

### 📦 Inventory Management
- **Auto-sync inventory** when orders are delivered
- **Manual stock adjustments** with audit trails
- **Bulk inventory uploads** via Excel
- **FEFO (First Expired, First Out)** tracking
- **Multi-location** inventory support

### 💬 Real-time Communication
- **Chat system** between restaurants and suppliers
- **Supplier favorites** for quick access
- **Online status** indicators
- **Message persistence** in database

### 📊 Analytics & Reporting
- **Revenue tracking** and growth analysis
- **Supplier performance** metrics
- **Inventory analytics** and alerts
- **Real-time dashboards**

### 📤 Bulk Operations
- **Excel-based uploads** for products and inventory
- **Template generation** for easy data entry
- **Data validation** with error reporting
- **Progress tracking** for large uploads

### 🔐 Security & Multi-tenancy
- **JWT-based authentication**
- **Role-based access control** (RBAC)
- **Multi-tenant architecture** with data isolation
- **Secure API endpoints**

## 🏗️ Architecture

Supplify follows a **microservices architecture**:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Gateway   │    │   Microservices  │
│   (Next.js)     │◄──►│   (NestJS)      │◄──►│   (NestJS)      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │   RabbitMQ      │    │   Redis Cache   │
│   Database      │    │   Message Queue │    │   & Sessions    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🛠️ Services

| Service | Port | Description |
|---------|------|-------------|
| **API Gateway** | 3001 | Central routing and authentication |
| **Auth Proxy** | 3002 | User management and RBAC |
| **Restaurants** | 3003 | Restaurant profiles and preferences |
| **Orders** | 3004 | Order lifecycle management |
| **Inventory** | 3005 | Stock tracking and management |
| **Catalog** | 3006 | Product catalog management |
| **Analytics** | 3007 | Business intelligence and reporting |
| **Suppliers** | 3008 | Supplier management |
| **Invoicing** | 3009 | Invoice generation and tracking |
| **Notifications** | 3010 | Email, SMS, push notifications |
| **Chat** | 3011 | Real-time messaging |

## 📁 Project Structure

```
supplify/
├── apps/
│   ├── web/                 # Next.js frontend application
│   └── api-gateway/         # Central API gateway
├── services/                # Microservices
│   ├── orders/             # Order management
│   ├── inventory/          # Inventory tracking
│   ├── catalog/            # Product catalog
│   ├── chat/               # Real-time messaging
│   └── ...                 # Other services
├── packages/               # Shared packages
│   ├── utils/              # Common utilities
│   ├── types/              # TypeScript definitions
│   └── config/             # Configuration
├── docs/                   # Documentation
├── tests/                  # Test files and scripts
├── infra/                  # Infrastructure as Code
└── scripts/                # Build and deployment scripts
```

## 🧪 Testing

```bash
# Run all tests
pnpm run test

# Run specific test suites
pnpm run test:unit          # Unit tests
pnpm run test:integration   # Integration tests
pnpm run test:e2e          # End-to-end tests

# Run tests for specific service
pnpm run test --filter=orders-service
```

## 📚 Documentation

- **[Complete Documentation](docs/SUPPLIFY_COMPLETE_DOCUMENTATION.md)** - Comprehensive A-Z guide
- **[Architecture Guide](docs/ARCHITECTURE.md)** - System architecture details
- **[API Documentation](docs/API.md)** - API endpoints and usage
- **[Deployment Guide](docs/DEPLOYMENT.md)** - Production deployment
- **[Development Guide](docs/CONTRIBUTING.md)** - Contributing guidelines

## 🚀 Deployment

### Docker Deployment

```bash
# Start all services with Docker Compose
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### Production Deployment

See [Deployment Guide](docs/DEPLOYMENT.md) for detailed production deployment instructions.

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/CONTRIBUTING.md) for details.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [docs/](docs/)
- **Issues**: [GitHub Issues](https://github.com/supplify/platform/issues)
- **Discussions**: [GitHub Discussions](https://github.com/supplify/platform/discussions)

## 🎯 Roadmap

- [ ] Mobile applications (iOS/Android)
- [ ] Advanced analytics with ML insights
- [ ] Integration with external ERP systems
- [ ] Multi-language support
- [ ] Advanced reporting and BI tools

---

**Supplify** - Streamlining B2B food supply chains with modern technology.