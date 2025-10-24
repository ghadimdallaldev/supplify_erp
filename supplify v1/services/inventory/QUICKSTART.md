# Inventory Service - Quick Start Guide

## Prerequisites

- Node.js 18+ and pnpm installed
- PostgreSQL 14+ running
- RabbitMQ 3.11+ running (optional for events)
- Redis 7+ running (optional for caching)

## 1. Install Dependencies

```bash
cd services/inventory
pnpm install
```

## 2. Setup Database

Create a PostgreSQL database:

```bash
createdb inventory_dev
```

Update your `.env` file:

```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/inventory_dev?schema=public"
PORT=3005
NODE_ENV=development

# Optional
RABBITMQ_URL="amqp://guest:guest@localhost:5672"
REDIS_HOST=localhost
REDIS_PORT=6379
```

## 3. Run Migrations

```bash
pnpm prisma migrate dev --name init
```

This will:
- Create all database tables
- Set up indexes
- Apply constraints

## 4. Seed Demo Data

```bash
pnpm prisma:seed
```

This populates the database with:
- ✅ 11 UOM definitions (kg, g, L, ml, each, pack, case, etc.)
- ✅ 2 locations (Kitchen, Dry Store)
- ✅ 12 inventory items (DRY/CHILL/FREEZE/CHEMICAL)
- ✅ 3 suppliers with vendor pack links
- ✅ 50+ stock movements (receipts, issues, transfers, waste)
- ✅ Batches with near-expiry dates for alert testing
- ✅ 1 completed inventory count with variances
- ✅ Par level configurations
- ✅ 1 sample recipe (Chicken Alfredo Pasta)
- ✅ Stock alerts (low stock, near expiry)
- ✅ Valuation snapshot

## 5. Start the Service

```bash
pnpm start:dev
```

The service will start on `http://localhost:3005`

## 6. Test the API

### Health Check

```bash
curl http://localhost:3005/health
```

### GraphQL Playground

Open browser: `http://localhost:3005/graphql`

Try this query:

```graphql
query {
  inventoryItems(filter: { restaurantId: "rest-001" }) {
    id
    name
    sku
    storageType
    stockOnHand {
      qtyOnHandBase
      avgCost
      totalValue
      location {
        name
      }
    }
  }
}
```

### REST Endpoints

#### Get Items
```bash
curl http://localhost:3005/items/restaurant/rest-001
```

#### Get Items Below Par (Replenishment List)
```bash
curl http://localhost:3005/items/restaurant/rest-001/below-par
```

#### Get Alerts
```bash
curl http://localhost:3005/alerts?restaurantId=rest-001
```

## 7. Common Operations

### Receive Stock

```bash
curl -X POST http://localhost:3005/movements/receive \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "ITEM_ID_FROM_QUERY",
    "locationId": "LOCATION_ID_FROM_QUERY",
    "qty": 50,
    "uom": "kg",
    "unitCost": 2.75,
    "expiryDate": "2025-12-31",
    "lotCode": "LOT-2025-001",
    "refType": "PO",
    "refId": "PO-12345",
    "causedBy": "user-123",
    "reason": "Weekly delivery"
  }'
```

### Issue Stock

```bash
curl -X POST http://localhost:3005/movements/issue \
  -H "Content-Type: application/json" \
  -d '{
    "itemId": "ITEM_ID",
    "locationId": "LOCATION_ID",
    "qty": 10,
    "uom": "kg",
    "refType": "RECIPE",
    "refId": "RECIPE-001",
    "causedBy": "user-123",
    "reason": "Recipe production"
  }'
```

### Start Inventory Count

```bash
curl -X POST http://localhost:3005/counts/start \
  -H "Content-Type: application/json" \
  -d '{
    "restaurantId": "rest-001",
    "locationId": "LOCATION_ID",
    "countType": "CYCLE",
    "conductedBy": "user-123",
    "notes": "Weekly cycle count - kitchen items"
  }'
```

## 8. View Data with Prisma Studio

```bash
pnpm prisma:studio
```

Opens browser UI at `http://localhost:5555` to browse/edit database.

## 9. Run Tests

```bash
# Unit tests
pnpm test

# Specific test file
pnpm test uom.service.spec

# Watch mode
pnpm test:watch

# Coverage
pnpm test:cov
```

## 10. Development Workflow

### Make Schema Changes

1. Edit `prisma/schema.prisma`
2. Create migration:
   ```bash
   pnpm prisma migrate dev --name add_new_field
   ```
3. Regenerate Prisma Client:
   ```bash
   pnpm prisma generate
   ```

### Add New Movement Type

1. Add enum to schema: `prisma/schema.prisma`
2. Create DTO: `src/movements/dto/movement.dto.ts`
3. Implement service method: `src/movements/movements.service.ts`
4. Add controller endpoint: `src/movements/movements.controller.ts`
5. Add GraphQL mutation: `src/graphql/schema.graphql` + resolver
6. Emit event: `src/events/events.service.ts`
7. Write tests

## 🎯 Key Endpoints Reference

### Items
- `GET /items/restaurant/:restaurantId` - List all items
- `GET /items/:id` - Item details
- `GET /items/barcode/:barcode?restaurantId=X` - Lookup by barcode
- `GET /items/:itemId/stock/:locationId` - Stock on hand
- `GET /items/:itemId/batches/:locationId` - FEFO batches
- `GET /items/:itemId/ledger` - Movement history
- `GET /items/restaurant/:restaurantId/below-par` - Replenishment list
- `POST /items/par-config` - Set par levels

### Movements
- `POST /movements/receive` - Receive stock
- `POST /movements/issue` - Issue stock (FEFO)
- `POST /movements/transfer` - Transfer between locations
- `POST /movements/waste` - Record wastage
- `POST /movements/adjust` - Manual adjustment

### Counts
- `POST /counts/start` - Start count
- `POST /counts/submit-line` - Submit counted quantity
- `POST /counts/finalize` - Finalize and post adjustments
- `GET /counts/:id` - Count details
- `GET /counts/restaurant/:restaurantId` - List counts

### Recipes
- `GET /recipes/restaurant/:restaurantId` - List recipes
- `GET /recipes/:id` - Recipe details
- `POST /recipes` - Create recipe
- `POST /recipes/produce` - Produce recipe (auto-deplete)
- `GET /recipes/:id/availability/:locationId` - Check availability

## 📊 Sample Data

The seed includes:

**Restaurant ID**: `rest-001`

**Locations**:
- Kitchen: `LOCATION_ID_1`
- Dry Store: `LOCATION_ID_2`

**Sample Items** (query to get IDs):
- All-Purpose Flour (DRY)
- Fresh Chicken Breast (CHILL) - **Low stock alert!**
- Fresh Whole Milk (CHILL) - **Near expiry!**
- Frozen Shrimp (FREEZE)
- Dish Soap (CHEMICAL)

**Alerts**: Check for low stock and near expiry alerts in the seeded data.

## 🐛 Troubleshooting

### Database Connection Error
```
Error: P1001: Can't reach database server
```
**Solution**: Ensure PostgreSQL is running and `DATABASE_URL` is correct.

### Prisma Client Not Generated
```
Error: Cannot find module '@prisma/client'
```
**Solution**: Run `pnpm prisma generate`

### Port Already in Use
```
Error: listen EADDRINUSE: address already in use :::3005
```
**Solution**: Change `PORT` in `.env` or kill the process using port 3005.

### Seed Fails
```
Error: Unique constraint failed
```
**Solution**: Clear database and re-run:
```bash
pnpm prisma migrate reset
pnpm prisma:seed
```

## 🎓 Next Steps

1. **Explore GraphQL Playground** - Try different queries and mutations
2. **Check Alerts** - View low stock and near expiry items
3. **Perform a Count** - Start a cycle count and submit variances
4. **Produce a Recipe** - Test auto-depletion with FEFO
5. **Review Ledger** - See complete audit trail for any item
6. **Test Replenishment** - View items below par and vendor pack suggestions

## 📚 Additional Resources

- [Full README](./README.md) - Complete API reference and architecture
- [Implementation Summary](./IMPLEMENTATION_SUMMARY.md) - Feature completeness
- [Prisma Schema](./prisma/schema.prisma) - Data model
- [GraphQL Schema](./src/graphql/schema.graphql) - API schema

## 🚀 Production Deployment

Before deploying to production:

1. [ ] Set production `DATABASE_URL`
2. [ ] Configure AWS Cognito for JWT auth
3. [ ] Set up Redis for caching
4. [ ] Configure RabbitMQ for events
5. [ ] Set up SendGrid API key for notifications
6. [ ] Configure S3 bucket for attachments
7. [ ] Run production migrations: `pnpm prisma migrate deploy`
8. [ ] Set `NODE_ENV=production`
9. [ ] Configure logging (Winston/Pino)
10. [ ] Set up monitoring (Datadog/New Relic)

---

**Happy Coding! 🎉**

For questions or issues, refer to the main [README](./README.md) or check the implementation details in [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md).

