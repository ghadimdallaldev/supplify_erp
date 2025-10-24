# Supplify - Complete B2B Food Supply Platform Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core Features](#core-features)
4. [Services](#services)
5. [API Documentation](#api-documentation)
6. [Database Schema](#database-schema)
7. [Authentication & Authorization](#authentication--authorization)
8. [Deployment](#deployment)
9. [Development Guide](#development-guide)
10. [Testing](#testing)
11. [Troubleshooting](#troubleshooting)

---

## Overview

**Supplify** is a comprehensive B2B food supply platform that connects restaurants with suppliers, providing end-to-end supply chain management, inventory tracking, order processing, and real-time communication.

### Key Value Propositions

- **Streamlined Ordering**: Restaurants can browse, search, and order from multiple suppliers in one platform
- **Real-time Inventory Management**: Automatic inventory updates when orders are delivered
- **Smart Analytics**: Revenue tracking, supplier performance, and business insights
- **Communication Hub**: Real-time chat between restaurants and suppliers
- **Bulk Operations**: Excel-based bulk uploads for products and inventory
- **Multi-tenant Architecture**: Secure, scalable platform for multiple organizations

### Target Users

- **Restaurants**: Order food supplies, manage inventory, track analytics
- **Suppliers**: Manage product catalogs, process orders, communicate with restaurants
- **Administrators**: Platform management, user oversight, system configuration

---

## Architecture

Supplify follows a **microservices architecture** with the following components:

### Frontend
- **Next.js Web Application** (`apps/web/`)
- **React-based UI** with TypeScript
- **Tailwind CSS** for styling
- **Real-time updates** via WebSocket connections

### Backend Services
- **API Gateway** (`apps/api-gateway/`) - Central routing and authentication
- **Orders Service** - Order management and processing
- **Inventory Service** - Stock tracking and management
- **Catalog Service** - Product catalog management
- **Chat Service** - Real-time messaging
- **Analytics Service** - Business intelligence and reporting
- **Auth Proxy** - Authentication and user management
- **And 10+ additional microservices**

### Infrastructure
- **PostgreSQL** - Primary database
- **RabbitMQ** - Message queuing
- **Redis** - Caching and session storage
- **Docker** - Containerization
- **Terraform** - Infrastructure as Code

### Data Flow
```
Restaurant → API Gateway → Orders Service → Inventory Service
                ↓
            Chat Service ← Supplier ← Catalog Service
```

---

## Core Features

### 1. Order Management System

#### Restaurant Features
- **Product Browsing**: Search and filter products from multiple suppliers
- **Shopping Cart**: Add products from different suppliers
- **Order Placement**: Submit orders with delivery preferences
- **Order Tracking**: Real-time status updates (Placed → Acknowledged → Dispatched → Delivered)
- **Order History**: Complete order history with analytics

#### Supplier Features
- **Order Processing**: Receive and acknowledge orders
- **Status Updates**: Mark orders as dispatched/delivered
- **Order Analytics**: Track order performance and revenue

#### Technical Implementation
- **Event-driven Architecture**: Order status changes trigger inventory updates
- **SLA Management**: Automatic acknowledgment timeouts
- **Multi-supplier Orders**: Automatic order splitting by supplier
- **Real-time Notifications**: WebSocket-based status updates

### 2. Inventory Management System

#### Auto-Sync Inventory
- **Automatic Updates**: Inventory updates when orders are delivered
- **Event-driven Sync**: Uses RabbitMQ for reliable inventory updates
- **Idempotent Operations**: Prevents duplicate inventory movements
- **Multi-tenant Support**: Secure inventory isolation per organization

#### Manual Inventory Management
- **Stock Adjustments**: Manual +/- adjustments with audit trails
- **Bulk Upload**: Excel-based inventory imports
- **Real-time Tracking**: Live inventory levels and movements
- **Location Management**: Multi-location inventory support

#### Advanced Features
- **FEFO (First Expired, First Out)**: Expiry date tracking
- **Batch/Lot Management**: Track product batches and lot codes
- **UOM Conversions**: Unit of measure conversions
- **Stock Ledger**: Complete audit trail of all movements

### 3. Real-time Chat System

#### Communication Features
- **Supplier Discovery**: Shows suppliers that restaurants order from
- **Favorites System**: Mark suppliers as favorites for quick access
- **Real-time Messaging**: WebSocket-based instant messaging
- **Message Persistence**: All messages saved to database
- **Online Status**: Real-time online/offline indicators
- **Unread Counts**: Track unread messages per conversation

#### Technical Implementation
- **WebSocket Integration**: Real-time bidirectional communication
- **Database Persistence**: PostgreSQL for message storage
- **Multi-tenant Chat**: Secure conversation isolation
- **Message Search**: Full-text search across conversations

### 4. Analytics & Reporting

#### Restaurant Analytics
- **Revenue Tracking**: Total revenue from completed orders
- **Order Analytics**: Order frequency, average order value
- **Supplier Performance**: Track supplier reliability and performance
- **Inventory Analytics**: Stock levels, turnover rates, low stock alerts

#### Supplier Analytics
- **Revenue Dashboard**: Total revenue from restaurant orders
- **Customer Analytics**: Restaurant customer insights
- **Product Performance**: Best-selling products and trends
- **Order Fulfillment**: Order processing metrics

#### Technical Features
- **Real-time Calculations**: Live analytics updates
- **Data Validation**: Prevents NaN values and data corruption
- **Historical Data**: Trend analysis and growth tracking
- **Export Capabilities**: Data export for external analysis

### 5. Bulk Upload System

#### Restaurant Bulk Operations
- **Inventory Import**: Excel-based inventory bulk upload
- **Template Generation**: Download Excel templates
- **Data Validation**: Comprehensive validation with error reporting
- **Progress Tracking**: Real-time upload progress

#### Supplier Bulk Operations
- **Product Catalog Import**: Bulk product uploads
- **Category Management**: Organize products by categories
- **Price Management**: Bulk price updates
- **Inventory Sync**: Automatic inventory updates

#### Technical Implementation
- **Excel Parsing**: Robust Excel file processing
- **Data Validation**: Multi-level validation (format, business rules, duplicates)
- **Error Handling**: Detailed error reporting and rollback
- **Progress Tracking**: Real-time upload status

### 6. User Management & Authentication

#### Role-based Access Control (RBAC)
- **Restaurant Users**: Order management, inventory, analytics
- **Supplier Users**: Order processing, product management, analytics
- **Admin Users**: Platform management, user oversight

#### Authentication Features
- **JWT-based Authentication**: Secure token-based auth
- **Multi-tenant Support**: Organization-based user isolation
- **Session Management**: Secure session handling
- **Password Security**: Encrypted password storage

### 7. Product Catalog Management

#### Supplier Product Management
- **Product CRUD**: Create, read, update, delete products
- **Category Organization**: Organize products by categories
- **Price Management**: Set and update product prices
- **Inventory Tracking**: Track supplier inventory levels

#### Restaurant Product Discovery
- **Search & Filter**: Advanced product search capabilities
- **Category Browsing**: Browse products by category
- **Supplier Comparison**: Compare products across suppliers
- **Favorites**: Save frequently ordered products

---

## Services

### Core Services

#### 1. Orders Service (`services/orders/`)
- **Port**: 3004
- **Responsibilities**: Order lifecycle management, status tracking, SLA enforcement
- **Key Features**:
  - Order placement and processing
  - Multi-supplier order splitting
  - Status transitions and notifications
  - SLA management and timeouts

#### 2. Inventory Service (`services/inventory/`)
- **Port**: 3005
- **Responsibilities**: Stock management, inventory tracking, auto-sync
- **Key Features**:
  - Real-time inventory updates
  - Auto-sync from order deliveries
  - Manual stock adjustments
  - Bulk inventory operations
  - FEFO and batch management

#### 3. Catalog Service (`services/catalog/`)
- **Port**: 3006
- **Responsibilities**: Product catalog management, search, categories
- **Key Features**:
  - Product CRUD operations
  - Category management
  - Search and filtering
  - Bulk product operations

#### 4. Chat Service (`services/chat/`)
- **Port**: 3011
- **Responsibilities**: Real-time messaging, conversation management
- **Key Features**:
  - WebSocket-based messaging
  - Message persistence
  - Online status tracking
  - Multi-tenant conversations

#### 5. Analytics Service (`services/analytics/`)
- **Port**: 3007
- **Responsibilities**: Business intelligence, reporting, metrics
- **Key Features**:
  - Revenue calculations
  - Performance metrics
  - Trend analysis
  - Data aggregation

### Supporting Services

#### 6. Auth Proxy (`services/auth-proxy/`)
- **Port**: 3002
- **Responsibilities**: Authentication, user management, RBAC
- **Key Features**:
  - JWT token management
  - User provisioning
  - Role-based access control
  - Multi-tenant user isolation

#### 7. Restaurants Service (`services/restaurants/`)
- **Port**: 3003
- **Responsibilities**: Restaurant management, preferences, favorites
- **Key Features**:
  - Restaurant profiles
  - Address management
  - Supplier preferences
  - Favorite products

#### 8. Suppliers Service (`services/suppliers/`)
- **Port**: 3008
- **Responsibilities**: Supplier management, profiles, settings
- **Key Features**:
  - Supplier profiles
  - Business information
  - Settings management
  - Performance tracking

#### 9. Invoicing Service (`services/invoicing/`)
- **Port**: 3009
- **Responsibilities**: Invoice generation, payment tracking
- **Key Features**:
  - Automatic invoice creation
  - Payment status tracking
  - Invoice management
  - Financial reporting

#### 10. Notifications Service (`services/notifications/`)
- **Port**: 3010
- **Responsibilities**: Email, SMS, push notifications
- **Key Features**:
  - Multi-channel notifications
  - Template management
  - Delivery tracking
  - Notification preferences

---

## API Documentation

### Authentication Endpoints

#### POST `/auth/login`
Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "user-123",
    "email": "user@example.com",
    "role": "RESTAURANT",
    "organizationId": "org-456"
  }
}
```

### Orders API

#### POST `/orders`
Create a new order.

**Request Body:**
```json
{
  "restaurantId": "restaurant-123",
  "deliveryAddress": "123 Main St, City, State",
  "notes": "Please deliver before 2 PM",
  "items": [
    {
      "productId": "product-456",
      "supplierId": "supplier-789",
      "qty": 10,
      "unitPrice": 5.99,
      "notes": "Fresh produce only"
    }
  ]
}
```

#### GET `/orders/:id`
Get order details by ID.

#### PUT `/orders/:id/status`
Update order status.

**Request Body:**
```json
{
  "status": "DISPATCHED",
  "notes": "Order dispatched at 10:30 AM"
}
```

### Inventory API

#### GET `/inventory/summary/:restaurantId`
Get inventory summary for restaurant.

**Response:**
```json
{
  "totalItems": 150,
  "totalValue": 12500.50,
  "items": [
    {
      "id": "item-123",
      "name": "Fresh Tomatoes",
      "sku": "TOM-001",
      "qtyOnHand": 25,
      "qtyAvailable": 20,
      "unitCost": 2.50,
      "totalValue": 62.50,
      "location": "Main Storage",
      "category": "Vegetables"
    }
  ]
}
```

#### POST `/inventory/adjustment`
Create manual inventory adjustment.

**Request Body:**
```json
{
  "itemId": "item-123",
  "locationId": "location-456",
  "restaurantId": "restaurant-789",
  "adjustment": 5,
  "reason": "Manual count adjustment",
  "userId": "user-123"
}
```

### Chat API

#### GET `/chat/threads`
Get chat threads for user.

**Query Parameters:**
- `userId`: User ID
- `orgType`: Organization type (RESTAURANT/SUPPLIER)

#### POST `/chat/messages`
Send a message.

**Request Body:**
```json
{
  "threadId": "thread-123",
  "senderId": "user-456",
  "senderRole": "RESTAURANT",
  "senderName": "Restaurant Name",
  "body": "Hello, I need to discuss my order",
  "replyToId": "message-789"
}
```

### Analytics API

#### GET `/analytics/revenue/:organizationId`
Get revenue analytics for organization.

**Response:**
```json
{
  "total": 125000.50,
  "growth": 15.5,
  "monthly": [
    {
      "month": "Jan",
      "revenue": 10500.00
    },
    {
      "month": "Feb", 
      "revenue": 12100.00
    }
  ],
  "bySupplier": [
    {
      "supplierId": "supplier-123",
      "name": "Fresh Foods Supply",
      "revenue": 45000.00,
      "orders": 25
    }
  ]
}
```

---

## Database Schema

### Core Tables

#### Orders
```sql
CREATE TABLE orders (
  id VARCHAR PRIMARY KEY,
  restaurant_id VARCHAR NOT NULL,
  supplier_id VARCHAR NOT NULL,
  status VARCHAR NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) NOT NULL,
  delivery_fee DECIMAL(10,2) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  delivery_address TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Inventory
```sql
CREATE TABLE stock_on_hand (
  item_id VARCHAR NOT NULL,
  restaurant_id VARCHAR NOT NULL,
  location_id VARCHAR NOT NULL,
  qty_on_hand_base INTEGER NOT NULL,
  qty_available_base INTEGER NOT NULL,
  qty_committed_base INTEGER NOT NULL,
  last_cost DECIMAL(10,2),
  avg_cost DECIMAL(10,2),
  total_value DECIMAL(10,2),
  last_movement_at TIMESTAMP,
  PRIMARY KEY (item_id, location_id)
);
```

#### Chat
```sql
CREATE TABLE chat_threads (
  id VARCHAR PRIMARY KEY,
  client_id VARCHAR NOT NULL,
  scope VARCHAR NOT NULL,
  participants VARCHAR[] NOT NULL,
  title VARCHAR,
  description TEXT,
  status VARCHAR DEFAULT 'ACTIVE',
  last_message_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Multi-tenant Architecture

All tables include `client_id` for tenant isolation:
- **Secure Data Isolation**: Each organization's data is completely isolated
- **Scalable Architecture**: Supports unlimited organizations
- **Compliance Ready**: Meets data privacy requirements

---

## Authentication & Authorization

### JWT-based Authentication

#### Token Structure
```json
{
  "sub": "user-123",
  "email": "user@example.com",
  "role": "RESTAURANT",
  "orgId": "org-456",
  "permissions": ["orders:read", "orders:write", "inventory:read"],
  "iat": 1640995200,
  "exp": 1641081600
}
```

#### Role Permissions

**Restaurant Role:**
- `orders:read` - View orders
- `orders:write` - Create/update orders
- `inventory:read` - View inventory
- `inventory:write` - Manage inventory
- `analytics:read` - View analytics
- `chat:read` - View messages
- `chat:write` - Send messages

**Supplier Role:**
- `orders:read` - View orders
- `orders:write` - Update order status
- `products:read` - View products
- `products:write` - Manage products
- `analytics:read` - View analytics
- `chat:read` - View messages
- `chat:write` - Send messages

**Admin Role:**
- `*:read` - Read access to all resources
- `*:write` - Write access to all resources
- `users:manage` - User management
- `system:admin` - System administration

### Security Features

- **Password Encryption**: Bcrypt hashing
- **Token Expiration**: Configurable token lifetimes
- **Rate Limiting**: API rate limiting per user
- **CORS Protection**: Cross-origin request protection
- **SQL Injection Prevention**: Parameterized queries
- **XSS Protection**: Input sanitization

---

## Deployment

### Docker Deployment

#### Prerequisites
- Docker and Docker Compose
- PostgreSQL database
- RabbitMQ message broker
- Redis cache

#### Quick Start
```bash
# Clone repository
git clone https://github.com/supplify/platform.git
cd platform

# Copy environment file
cp env.template .env

# Start services
docker-compose up -d

# Run database migrations
docker-compose exec api-gateway npm run migrate
```

#### Service Configuration

**Environment Variables:**
```bash
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/supplify

# Message Queue
RABBITMQ_URL=amqp://user:password@localhost:5672

# Redis
REDIS_URL=redis://localhost:6379

# Services
ORDERS_SERVICE_URL=http://localhost:3004
INVENTORY_SERVICE_URL=http://localhost:3005
CATALOG_SERVICE_URL=http://localhost:3006
CHAT_SERVICE_URL=http://localhost:3011
```

### Production Deployment

#### Infrastructure Requirements
- **Load Balancer**: Nginx or AWS ALB
- **Database**: PostgreSQL cluster with replication
- **Cache**: Redis cluster
- **Message Queue**: RabbitMQ cluster
- **Monitoring**: Prometheus + Grafana
- **Logging**: ELK stack or similar

#### Scaling Considerations
- **Horizontal Scaling**: Stateless microservices
- **Database Scaling**: Read replicas, connection pooling
- **Cache Strategy**: Redis clustering, cache invalidation
- **Message Queue**: RabbitMQ clustering, message persistence

---

## Development Guide

### Getting Started

#### Prerequisites
- Node.js 18+
- pnpm package manager
- PostgreSQL 14+
- RabbitMQ 3.8+
- Redis 6+

#### Setup
```bash
# Install dependencies
pnpm install

# Setup database
pnpm run db:setup

# Start development servers
pnpm run dev
```

#### Project Structure
```
supplify/
├── apps/
│   ├── web/                 # Next.js frontend
│   └── api-gateway/         # API gateway
├── services/
│   ├── orders/             # Orders microservice
│   ├── inventory/          # Inventory microservice
│   ├── catalog/            # Catalog microservice
│   └── ...                 # Other microservices
├── packages/
│   ├── utils/              # Shared utilities
│   ├── types/              # TypeScript types
│   └── config/             # Configuration
└── docs/                   # Documentation
```

### Development Workflow

#### Adding New Features
1. **Design**: Create feature specification
2. **Backend**: Implement microservice endpoints
3. **Frontend**: Create React components
4. **Testing**: Write unit and integration tests
5. **Documentation**: Update API docs

#### Code Standards
- **TypeScript**: Strict type checking
- **ESLint**: Code linting and formatting
- **Prettier**: Code formatting
- **Husky**: Git hooks for quality checks
- **Jest**: Unit testing framework

### Testing

#### Test Structure
```
tests/
├── unit/                   # Unit tests
├── integration/            # Integration tests
├── e2e/                    # End-to-end tests
└── fixtures/               # Test data
```

#### Running Tests
```bash
# Unit tests
pnpm run test:unit

# Integration tests
pnpm run test:integration

# E2E tests
pnpm run test:e2e

# All tests
pnpm run test
```

#### Test Coverage
- **Unit Tests**: 90%+ coverage required
- **Integration Tests**: Critical paths covered
- **E2E Tests**: User journeys tested

---

## Troubleshooting

### Common Issues

#### Database Connection Issues
```bash
# Check database status
docker-compose ps postgres

# View database logs
docker-compose logs postgres

# Reset database
docker-compose down -v
docker-compose up -d postgres
```

#### Service Communication Issues
```bash
# Check service health
curl http://localhost:3004/health
curl http://localhost:3005/health

# View service logs
docker-compose logs orders-service
docker-compose logs inventory-service
```

#### Frontend Issues
```bash
# Clear Next.js cache
rm -rf .next

# Reinstall dependencies
rm -rf node_modules
pnpm install

# Check build
pnpm run build
```

### Performance Optimization

#### Database Optimization
- **Indexing**: Proper database indexes
- **Query Optimization**: Efficient queries
- **Connection Pooling**: Database connection management
- **Caching**: Redis caching strategy

#### Frontend Optimization
- **Code Splitting**: Lazy loading components
- **Image Optimization**: Next.js image optimization
- **Bundle Analysis**: Webpack bundle analyzer
- **Caching**: Service worker caching

### Monitoring & Logging

#### Application Monitoring
- **Health Checks**: Service health endpoints
- **Metrics**: Prometheus metrics collection
- **Alerting**: Grafana alerting rules
- **Dashboards**: Service performance dashboards

#### Logging Strategy
- **Structured Logging**: JSON-formatted logs
- **Log Levels**: DEBUG, INFO, WARN, ERROR
- **Log Aggregation**: Centralized log collection
- **Log Rotation**: Automated log cleanup

---

## Conclusion

Supplify is a comprehensive B2B food supply platform that provides:

- **Complete Order Management**: From placement to delivery
- **Real-time Inventory Tracking**: Automatic updates and manual management
- **Advanced Analytics**: Business intelligence and reporting
- **Real-time Communication**: Chat between restaurants and suppliers
- **Bulk Operations**: Excel-based bulk uploads and management
- **Multi-tenant Architecture**: Secure, scalable platform
- **Modern Technology Stack**: Microservices, real-time updates, modern UI

The platform is designed to scale from small restaurants to large food service organizations, providing the tools needed to manage complex supply chains efficiently.

For more detailed information about specific features or implementation details, refer to the individual service documentation in the `docs/` directory.
