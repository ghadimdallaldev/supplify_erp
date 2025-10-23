# Supplify Inventory Management Service

A comprehensive, real-time inventory management microservice for multi-location restaurant operations. Features FEFO batch tracking, multi-UOM conversions, cycle counts, recipe/BOM auto-depletion, par level management, and full auditability.

## 🌟 Key Features

### Stock Management
- **Real-time tracking** across multiple locations and units
- **Multi-UOM support** with automatic conversions (case → pack → each; kg ↔ g; L ↔ ml)
- **Batch/Lot tracking** with expiry dates and FEFO (First Expiry, First Out) logic
- **Vendor pack conversions** for accurate receiving and ordering
- **Immutable ledger** for complete audit trail

### Valuation & Costing
- **FIFO** (First In, First Out) valuation
- **Weighted Average** cost calculation
- Automatic cost updates on receipts
- Monthly valuation snapshots for reporting

### Inventory Counts
- **Cycle counts** (partial, scheduled)
- **Full physical counts**
- Blind count support
- Variance tracking and approval workflow
- Automatic adjustment posting

### Recipe/BOM Management
- Define recipes with multi-component BOMs
- Auto-depletion using FEFO when recipes are produced
- Waste percentage and yield tracking
- Recipe costing and availability checks

### Par Levels & Replenishment
- Min/max par levels per item per location
- Reorder points with safety stock
- Automated low-stock alerts
- Replenishment suggestions with vendor pack sizing

### Alerts & Notifications
- **Low stock** alerts (real-time + daily)
- **Near expiry** warnings with configurable horizons
- **Count overdue** notifications
- **Excess waste** reporting

### Mobile-Friendly
- Barcode/QR scanning (via web API)
- GS1 barcode parsing
- Touch-optimized interfaces

### Multi-Tenant & Secure
- Restaurant-level isolation
- RBAC with Cognito JWT validation
- Row-level security guards
- Idempotency keys for safe retries

## 📊 Architecture

### Data Models

#### Core Entities
- **Item**: Normalized catalog items with storage type, UOM, allergens
- **Location**: Restaurant sites/storerooms
- **Batch**: Lot-level tracking with expiry dates, lot codes, supplier info
- **StockLedger**: Immutable movement log (receipts, issues, transfers, waste, adjustments)
- **StockOnHand**: Materialized view of current stock per item+location

#### Configuration
- **Uom**: Unit definitions and conversion ratios
- **SupplierLink**: Mapping items to supplier products and vendor packs
- **ParConfig**: Min/max levels and reorder points

#### Operations
- **InventoryCount**: Cycle/full count headers
- **InventoryCountLine**: Individual item counts with variance
- **Recipe**: Bills of Material with yield
- **RecipeComponent**: Recipe ingredients with waste %

#### Reporting
- **ValuationSnapshot**: Monthly FIFO/WAVG snapshots
- **Alert**: System alerts (low stock, near expiry, etc.)

### Business Logic

#### FEFO (First Expiry, First Out)
All stock issues consume batches in expiry date order, then FIFO:
```
1. Sort batches by: expiryDate ASC, createdAt ASC
2. Allocate qty from earliest expiring batch
3. Spill to next batch if insufficient
```

#### Multi-UOM Conversions
- All quantities stored in base UOM (e.g., g, ml, each)
- Display in friendly units (kg, L, case)
- Conversions via UOM ratio table:
  ```
  qtyBase = qty * ratioToBase
  ```

#### Weighted Average Cost
On receipt:
```
newAvgCost = (currentQty * currentAvgCost + newQty * newUnitCost) / (currentQty + newQty)
```

#### Valuation Methods
- **FIFO**: Value inventory at cost of oldest batches
- **WAVG**: Value at weighted average cost per item+location

### Movement Types
- `RECEIPT`: Receiving from supplier (creates batch)
- `ISSUE`: Consumption/usage (FEFO depletion)
- `TRANSFER_OUT` / `TRANSFER_IN`: Move between locations
- `WASTE`: Spoilage, overprep
- `RETURN`: Return to supplier
- `ADJUSTMENT`: Count variance, manual correction

### Idempotency
All mutations accept optional `idempotencyKey`:
- Prevents duplicate processing
- Safe for retries
- Keys stored in `StockLedger.idempotencyKey`

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- RabbitMQ 3.11+
- Redis 7+ (for caching)

### Installation

```bash
cd services/inventory
pnpm install
```

### Database Setup

```bash
# Run migrations
pnpm prisma:migrate

# Seed demo data
pnpm prisma:seed
```

### Environment Variables

Copy `.env.example` and configure:

```env
DATABASE_URL="postgresql://user:pass@localhost:5432/inventory"
REDIS_HOST=localhost
REDIS_PORT=6379
RABBITMQ_URL="amqp://guest:guest@localhost:5672"
PORT=3005
```

### Run Development Server

```bash
pnpm start:dev
```

Service runs on `http://localhost:3005`

GraphQL Playground: `http://localhost:3005/graphql`

## 📡 API Reference

### REST Endpoints

#### Movements
- `POST /movements/receive` - Receive stock
- `POST /movements/issue` - Issue stock (FEFO)
- `POST /movements/transfer` - Transfer between locations
- `POST /movements/waste` - Record wastage
- `POST /movements/adjust` - Manual adjustment

#### Items
- `GET /items/restaurant/:restaurantId` - List items
- `GET /items/:id` - Item details
- `GET /items/barcode/:barcode` - Lookup by barcode
- `GET /items/:itemId/stock/:locationId` - Stock on hand
- `GET /items/:itemId/batches/:locationId` - FEFO batches
- `GET /items/:itemId/ledger` - Movement history
- `GET /items/restaurant/:restaurantId/below-par` - Replenishment list

#### Counts
- `POST /counts/start` - Start count
- `POST /counts/submit-line` - Submit counted qty
- `POST /counts/finalize` - Finalize and post adjustments
- `GET /counts/:id` - Count details
- `GET /counts/restaurant/:restaurantId` - List counts

#### Recipes
- `GET /recipes/restaurant/:restaurantId` - List recipes
- `GET /recipes/:id` - Recipe details with costing
- `POST /recipes` - Create recipe
- `POST /recipes/produce` - Produce recipe (auto-deplete)
- `GET /recipes/:id/availability/:locationId` - Check if can produce

### GraphQL Schema

See `src/graphql/schema.graphql` for full schema.

#### Key Queries
```graphql
query GetItems($filter: InventoryItemFilter!) {
  inventoryItems(filter: $filter) {
    id
    name
    stockOnHand {
      qtyAvailableBase
      avgCost
      totalValue
    }
  }
}

query GetValuation($restaurantId: String!, $method: ValuationMethod!) {
  valuation(restaurantId: $restaurantId, method: $method) {
    totalValue
    itemValuations {
      itemName
      qty
      totalCost
    }
  }
}

query GetReplenishment($restaurantId: String!) {
  parSuggestions(restaurantId: $restaurantId) {
    item { name }
    qtyAvailable
    reorderPoint
    qtyToOrder
    supplierLinks {
      supplierId
      vendorUom
      lastPrice
    }
  }
}
```

#### Key Mutations
```graphql
mutation ReceiveStock($input: ReceiveStockInput!) {
  receiveStock(input: $input) {
    message
    batch { id qtyOnHandBase }
  }
}

mutation ProduceRecipe($input: ProduceRecipeInput!) {
  postRecipeProduction(input: $input) {
    productionId
    yieldProduced
    estimatedCost
  }
}

mutation FinalizeCount($countId: ID!, $conductedBy: String!) {
  finalizeCount(countId: $countId, conductedBy: $conductedBy) {
    summary {
      totalItems
      itemsWithVariance
      totalVarianceCost
      accuracyPct
    }
  }
}
```

## 📨 RabbitMQ Events

### Published Events

- `inventory.received` - Stock received
- `inventory.issued` - Stock consumed
- `inventory.transferred` - Stock moved
- `inventory.wasted` - Wastage recorded
- `inventory.adjusted` - Adjustment posted
- `inventory.lowstock` - Below reorder point
- `inventory.nearexpiry` - Batch expiring soon
- `inventory.count.started` - Count begun
- `inventory.count.finalized` - Count completed
- `inventory.replenishment.created` - Replenishment list generated

### Event Consumers

Other services subscribe to:
- **notifications**: Send alerts via SendGrid
- **analytics**: Roll up KPIs
- **orders**: Reconcile POs on receipt
- **recommendations**: Re-rank based on stock

## ⏰ Scheduled Jobs

- **Daily 07:00 UTC**: Check low stock, emit alerts
- **Daily 08:00 UTC**: Check near-expiry, emit alerts
- **Monthly 1st @ 02:00 UTC**: Create valuation snapshots
- **Weekly Sunday @ 03:00 UTC**: Clean up empty batches

## 🧪 Testing

```bash
# Unit tests
pnpm test

# E2E tests
pnpm test:e2e

# Coverage
pnpm test:cov
```

### Test Scenarios
- UOM conversions (kg ↔ g, case → each)
- FEFO batch selection
- FIFO vs WAVG valuation
- Count variance calculation
- Recipe auto-depletion
- Transfer coherence
- Idempotency

## 🔒 Security

- **JWT validation** via AWS Cognito
- **Row-level security** on `restaurantId`
- **RBAC**: `inventory-manager`, `inventory-counter`, `viewer`
- **Immutable ledger**: No editing after posting
- **Reversals**: Corrections via reversal entries
- **Audit trail**: `causedBy` user ID on all movements

## 📈 Performance

- **Materialized StockOnHand**: Pre-computed for fast queries
- **Indexed hot paths**: `(restaurantId, locationId, itemId)`, `expiryDate`, `barcode`
- **Redis caching**: Items list, SOH, par summaries
- **Transactional writes**: ACID guarantees
- **Idempotency**: Safe retries without duplication

## 🛠️ Development

### Code Structure

```
src/
├── common/           # Shared utilities (UOM, FEFO, Valuation)
├── counts/           # Inventory count flows
├── events/           # RabbitMQ event publishers
├── graphql/          # GraphQL schema & resolvers
├── health/           # Health checks
├── items/            # Item queries, SOH, par config
├── jobs/             # Scheduled background tasks
├── movements/        # Stock movements (receive, issue, transfer, waste)
├── prisma/           # Database client & service
├── recipes/          # Recipe/BOM management
├── app.module.ts
└── main.ts
```

### Adding a New Movement Type

1. Add enum to `prisma/schema.prisma`
2. Create DTO in `movements/dto/`
3. Implement service method in `movements/movements.service.ts`
4. Add controller endpoint
5. Add GraphQL mutation
6. Emit event via `events.service.ts`
7. Write tests

## 📚 Additional Resources

- [Prisma Schema](prisma/schema.prisma)
- [GraphQL Schema](src/graphql/schema.graphql)
- [Seed Data](prisma/seed.ts)
- [Main Architecture](../../docs/ARCHITECTURE.md)

## 🐛 Troubleshooting

### Stock variance unexplained
- Check `StockLedger` for all movements
- Verify batch quantities sum to `StockOnHand.qtyOnHandBase`
- Run count to reconcile

### FEFO not selecting correct batch
- Verify `expiryDate` populated
- Check batch status (must be `OK`, not `HOLD` or `QUARANTINE`)

### Slow queries
- Check indexes on `itemId`, `locationId`, `expiryDate`
- Verify `StockOnHand` is up to date
- Consider Redis caching for hot reads

## 📄 License

Proprietary - Supplify Platform

---

**Built with:** NestJS, Prisma, PostgreSQL, RabbitMQ, GraphQL, Redis

