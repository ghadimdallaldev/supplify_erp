# Supplify Architecture

## Overview

Supplify is a B2B F&B procurement platform built using microservices architecture. This document describes the system architecture, components, and design decisions.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                             │
│                    Next.js 14 Web App                        │
│              (React 18, TailwindCSS, shadcn/ui)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ GraphQL / REST
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                     API Gateway                              │
│              (NestJS, GraphQL, RabbitMQ)                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
         ┌─────────────┼─────────────┐
         │             │             │
    RabbitMQ       PostgreSQL      Redis
    (Events)       (Database)     (Cache)
         │             │             │
         └─────────────┼─────────────┘
                       │
    ┌──────────────────┴──────────────────┐
    │                                     │
┌───▼────┐  ┌────────┐  ┌────────┐  ┌───▼────┐
│Catalog │  │Orders  │  │Restaur │  │Supplier│
│Service │  │Service │  │Service │  │Service │
└────────┘  └────────┘  └────────┘  └────────┘
    │           │           │           │
┌───▼────┐  ┌───▼───┐  ┌───▼──┐  ┌────▼────┐
│Loyalty │  │Notific│  │Analyt│  │Recommend│
│Service │  │Service│  │Service│  │Service  │
└────────┘  └───────┘  └──────┘  └─────────┘
```

## Core Components

### 1. Frontend (Web App)

**Technology**: Next.js 14 with App Router

**Responsibilities**:
- Server-side rendering for SEO and performance
- Client-side interactivity
- Form handling and validation
- State management with React Query
- Internationalization (EN/AR)

**Key Features**:
- Product catalog browsing
- Shopping cart management
- Order placement and tracking
- Analytics dashboards with Recharts
- Favorites management
- Loyalty program display

### 2. API Gateway

**Technology**: NestJS with GraphQL

**Responsibilities**:
- Single entry point for all client requests
- Authentication and authorization
- Request routing to microservices
- Response aggregation
- Rate limiting
- Caching

**Communication**:
- GraphQL for complex queries
- REST for simple operations
- RabbitMQ for async operations

### 3. Microservices

#### Catalog Service
- Product management
- Category hierarchy
- Image uploads to S3
- Search functionality
- Inventory management

#### Orders Service
- Shopping cart management
- Order placement
- Multi-supplier order splitting
- Order status tracking
- Order history

#### Restaurants Service
- Restaurant profile management
- Address management
- Favorites list
- Preferred suppliers

#### Suppliers Service
- Supplier profile management
- Promotion campaigns
- Featured products
- Billing management

#### Loyalty Service
- Points accrual and redemption
- Tier management (Bronze/Silver/Gold)
- Rewards calculation
- Points ledger

#### Recommendations Service
- Similar product suggestions
- Cheaper alternative finding
- Promotion-boosted recommendations
- Rule-based engine (ML-ready)

#### Notifications Service
- Email notifications via SendGrid
- In-app notifications
- Event-driven triggers
- Template management

#### Analytics Service
- Data aggregation
- Dashboard metrics
- Spend analytics
- Top products/suppliers
- Trend analysis

#### Auth Proxy Service
- JWT token verification
- User provisioning
- Cognito integration
- Session management

## Data Layer

### PostgreSQL Databases

Each service has its own database schema:
- **Catalog**: Products, Categories
- **Orders**: Orders, OrderItems, Cart, CartItems
- **Restaurants**: Restaurants, Addresses, Favorites
- **Suppliers**: Suppliers, Promotions
- **Loyalty**: PointsLedger
- **Analytics**: SpendBySupplier, TopItems
- **Auth**: Users

### Redis Cache

Used for:
- Product catalog caching
- Session storage
- Rate limiting
- API response caching

### RabbitMQ

Message patterns:
- **Events**: `order.created`, `order.status.changed`, `order.delivered`
- **RPC**: Service-to-service synchronous calls
- **Queues**: Per-service queues for message isolation

## External Services

### AWS Cognito
- User authentication
- OAuth 2.0 / OpenID Connect
- User groups for RBAC
- Password policies

### AWS S3
- Product images
- Document storage
- Static assets
- Presigned URLs for uploads

### CloudFront
- CDN for S3 assets
- Global content delivery
- HTTPS enforcement
- Cache optimization

### SendGrid
- Transactional emails
- Order confirmations
- Status updates
- Marketing emails

## Design Patterns

### 1. Microservices Pattern
- Independent services
- Single responsibility
- Autonomous deployment
- Technology diversity

### 2. API Gateway Pattern
- Unified entry point
- Service aggregation
- Protocol translation
- Security enforcement

### 3. Event-Driven Architecture
- Asynchronous communication
- Loose coupling
- Scalability
- Eventual consistency

### 4. CQRS (Command Query Responsibility Segregation)
- Separate read/write paths
- Optimized queries
- Analytics aggregations
- Performance optimization

### 5. Repository Pattern
- Data access abstraction
- Testability
- Maintainability
- Database independence

## Security Architecture

### Authentication Flow
1. User logs in via Cognito Hosted UI
2. Cognito returns JWT token
3. Frontend sends token with requests
4. API Gateway verifies token via JWKS
5. Auth-proxy provisions user if first login
6. Services validate requests

### Authorization
- Role-based access control (RBAC)
- Cognito groups: `restaurant`, `supplier`, `admin`
- Resource-level permissions
- Row-level security in queries

### Data Protection
- All traffic over HTTPS/TLS
- Database encryption at rest
- S3 encryption
- Secrets in AWS Secrets Manager
- Environment variable isolation

## Scalability

### Horizontal Scaling
- ECS Fargate for services
- Auto-scaling based on CPU/Memory
- Load balancing via ALB
- Stateless services

### Database Scaling
- Read replicas for analytics
- Connection pooling
- Query optimization
- Indexing strategy

### Caching Strategy
- Redis for hot data
- CDN for static assets
- API response caching
- Database query caching

## Observability

### Logging
- Structured JSON logs
- Winston logger
- CloudWatch Logs
- Log aggregation

### Monitoring
- Prometheus metrics
- CloudWatch metrics
- Service health checks
- Error tracking

### Tracing
- OpenTelemetry
- Distributed tracing
- Performance profiling
- Bottleneck identification

## Disaster Recovery

### Backup Strategy
- RDS automated backups (7 days)
- Manual snapshots before deployments
- S3 versioning for assets
- Infrastructure as Code (Terraform)

### Recovery Procedures
1. Database: Restore from RDS snapshot
2. Services: Redeploy from Docker images
3. Infrastructure: Terraform apply
4. Data: Replay events from RabbitMQ

## Performance Optimization

### Frontend
- Server-side rendering
- Code splitting
- Image optimization
- Lazy loading

### Backend
- Database indexing
- Query optimization
- Connection pooling
- Response caching

### Infrastructure
- CDN for static assets
- Redis for hot data
- Database read replicas
- Auto-scaling

## Future Enhancements

### Phase 2
- Mobile apps (React Native)
- Real-time order tracking
- Chat between restaurants & suppliers
- Advanced search with Elasticsearch

### Phase 3
- Machine learning recommendations
- Demand forecasting
- Price optimization
- Inventory prediction

### Phase 4
- Multi-region deployment
- Blockchain for supply chain
- IoT integration
- Advanced analytics with AI

## Technology Decisions

### Why NestJS?
- TypeScript-first
- Modular architecture
- Built-in dependency injection
- Microservices support
- Strong community

### Why GraphQL?
- Flexible queries
- Type safety
- Single endpoint
- Efficient data fetching
- Developer experience

### Why RabbitMQ?
- Reliable message delivery
- Flexible routing
- Easy to manage
- Good performance
- Wide language support

### Why PostgreSQL?
- ACID compliance
- Rich feature set
- JSON support
- Full-text search
- Mature ecosystem

### Why Next.js?
- React framework
- Server-side rendering
- App Router
- TypeScript support
- Great developer experience

## Conclusion

This architecture provides:
- **Scalability**: Horizontal scaling of services
- **Reliability**: Fault isolation and redundancy
- **Maintainability**: Clean separation of concerns
- **Performance**: Caching and optimization
- **Security**: Defense in depth
- **Developer Experience**: Modern tooling and practices

