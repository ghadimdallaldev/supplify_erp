# Pinned Products Feature Documentation

## Overview

The Pinned Products feature allows restaurants to pin their frequently ordered products per supplier, surfacing them first in all product lists, searches, and carts for faster ordering.

## Architecture

### Data Model

**PinnedProduct** (PostgreSQL via Prisma)
```prisma
model PinnedProduct {
  id           String   @id @default(cuid())
  restaurantId String
  supplierId   String
  productId    String
  sortIndex    Int      @default(0)
  note         String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([restaurantId, supplierId, productId])
  @@index([restaurantId, supplierId, sortIndex])
}
```

**Scope**: Pins are scoped to (restaurantId, supplierId) pairs
**Ordering**: `sortIndex` is dense (0..n-1) and updated on drag-drop
**Limit**: Max 200 pins per supplier per restaurant (configurable)

### Caching Strategy

**Redis Keys**:
```
pins:v1:${restaurantId}:${supplierId}
```

**Format**: JSON array of `{productId, sortIndex, note}`
**TTL**: 24 hours
**Invalidation**: On any pin mutation (create, delete, reorder, update)

### API Layers

#### REST Endpoints (restaurants service)

- `GET /pins?restaurantId=X&supplierId=Y` - Get pinned products
- `POST /pins/pin` - Pin a product
- `DELETE /pins/unpin` - Unpin a product
- `PUT /pins/reorder` - Reorder pinned products
- `PUT /pins/:id/note` - Update pin note

#### GraphQL (api-gateway)

**Queries**:
```graphql
pinnedProducts(supplierId: ID!): [PinnedProduct!]!

supplierProductsWithPins(
  supplierId: ID!
  search: String
  categoryId: ID
  first: Int
  after: String
): ProductConnection!
```

**Mutations**:
```graphql
pinProduct(input: PinProductInput!): PinnedProduct!
unpinProduct(input: UnpinProductInput!): Boolean!
reorderPinnedProducts(input: ReorderPinnedProductsInput!): [PinnedProduct!]!
updatePinNote(id: ID!, note: String!): PinnedProduct!
```

#### RabbitMQ Events

Published on mutations:
- `pins.pinned` - Product pinned
- `pins.unpinned` - Product unpinned
- `pins.reordered` - Pins reordered

Consumed by:
- **Analytics service**: Track pin conversion rates, time-to-add metrics
- **Recommendations service**: Boost pinned products in suggestions

## Business Logic

### Pinning Rules

1. **Idempotency**: Pinning an already-pinned product returns existing (updates note if provided)
2. **Sort Index Assignment**: New pins get `max(sortIndex) + 1`
3. **Max Limit**: 200 pins per supplier enforced at service layer
4. **Automatic Caching**: Cache populated on first read, invalidated on write

### Merging Pinned + Regular Products

**Algorithm** (in `supplierProductsWithPins` resolver):

1. Fetch pinned products from restaurants service
2. Fetch regular supplier products from catalog service
3. Separate into pinned vs non-pinned based on `productId`
4. Sort pinned by `sortIndex`
5. If search query present, filter pins by search term
6. Merge: `[...pinnedBySortIndex, ...nonPinned]`
7. Return first `N` with pagination metadata

**Search Behavior**:
- Pinned products matching search appear first
- If no pins match, show "Pinned (unfiltered)" rail above results
- User can toggle "Pin priority" (persisted setting, default ON)

### Reordering

**Client** (drag-drop):
1. User drags pin to new position
2. Local state updates optimistically
3. After 300ms throttle, `reorderPinnedProducts` mutation fires
4. Server updates `sortIndex` for all pins (0..n-1) in transaction
5. Cache invalidated, queries refetched

**Server**:
```typescript
// Update all pins in transaction
await prisma.$transaction(
  productIdsInOrder.map((productId, index) =>
    prisma.pinnedProduct.updateMany({
      where: { restaurantId, supplierId, productId },
      data: { sortIndex: index },
    })
  )
);
```

## Frontend Components

### `<PinToggleButton />`

**Purpose**: Toggle pin/unpin for a product

**Props**:
- `productId: string` - Product to pin
- `supplierId: string` - Supplier scope
- `isPinned: boolean` - Current pin state
- `onToggle?: (pinned: boolean) => void` - Callback

**Features**:
- ⚡ Optimistic updates
- 🎨 Star icon (filled when pinned)
- 📱 Touch-friendly (48px tap target)
- ♿ Accessible (ARIA labels, keyboard support)
- 🌐 i18n ready

**Usage**:
```tsx
<PinToggleButton
  productId="prod-123"
  supplierId="sup-456"
  isPinned={product.isPinned}
/>
```

### `<PinnedRail />`

**Purpose**: Horizontal/vertical rail of pinned products with drag-drop reorder

**Props**:
- `supplierId: string` - Supplier scope
- `pins: PinnedProduct[]` - Pinned products
- `orientation?: 'horizontal' | 'vertical'` - Layout direction
- `onReorder?: (newOrder: string[]) => void` - Callback

**Features**:
- 🎯 Drag-drop reordering (@dnd-kit)
- ⚡ Optimistic updates with 300ms throttle
- 🔄 Keyboard navigation (arrow keys to reorder)
- 📝 Inline note display
- 🗑️ Quick unpin with × button
- 🎨 Empty state with CTA

**Usage**:
```tsx
<PinnedRail
  supplierId="sup-456"
  pins={pinnedProducts}
  orientation="horizontal"
/>
```

### Integrated Product List

**Example**: `/suppliers/[id]/page.tsx`

**Features**:
- Pinned rail above product grid
- Star badges on pinned products
- Pin toggle on each product card
- Search filters both pinned + regular
- "Pinned Matches" section when searching

## Security & Guards

### Authentication

- **JWT Validation**: Extract `restaurantId` from Cognito token
- **Tenant Isolation**: All queries scoped to authenticated restaurant
- **RBAC**: Only restaurant users can mutate their pins

**Resolver Guard**:
```typescript
private getRestaurantId(context: any): string {
  return context.req?.user?.restaurantId;
}
```

### Rate Limiting

**Redis-based**: 100 requests/minute per restaurant
**Endpoints**: All mutations (pin, unpin, reorder)

### Input Validation

- `restaurantId`: Required, validated against JWT
- `supplierId`: Required, must exist and be visible to restaurant
- `productId`: Required, must exist in supplier catalog
- `sortIndex`: Auto-assigned, not user-provided
- `productIdsInOrder`: Must match existing pins (prevents injection)

## Performance

### Database Indexes

```sql
CREATE INDEX idx_pinned_restaurant_supplier_sort 
  ON pinned_products(restaurant_id, supplier_id, sort_index);

CREATE UNIQUE INDEX idx_pinned_unique 
  ON pinned_products(restaurant_id, supplier_id, product_id);
```

### Query Optimization

1. **Batch Fetching**: Load all pins in one query
2. **WHERE IN**: Fetch product details with `WHERE productId IN (...)`
3. **Redis Caching**: ~2KB per supplier scope, 24h TTL
4. **Pagination**: Return first N items, avoid over-fetching

### Metrics

**Expected**:
- Pin toggle: <100ms (cached)
- Reorder: <200ms (transaction + cache bust)
- Product list with pins: <300ms (merged query)
- Cache hit rate: >95%

## Testing

### Unit Tests

**Location**: `services/restaurants/src/pins/__tests__/pins.service.spec.ts`

**Coverage**:
- ✅ Pin new product → sortIndex increments
- ✅ Pin existing product → returns existing
- ✅ Update note on existing pin
- ✅ Max pins limit enforced (200)
- ✅ Unpin removes and invalidates cache
- ✅ Reorder updates sortIndex (0..n-1)
- ✅ Cache hit returns cached data
- ✅ Cache miss fetches from DB and populates

### Integration Tests

**Scenario**: Pin → Fetch merged list → Verify pinned first

```typescript
it('should return pins first in merged product list', async () => {
  // Pin products
  await pinsService.pinProduct('rest-1', 'sup-1', 'prod-A');
  await pinsService.pinProduct('rest-1', 'sup-1', 'prod-B');
  
  // Fetch merged list
  const result = await resolver.supplierProductsWithPins('sup-1');
  
  // Verify
  expect(result.edges[0].node.id).toBe('prod-A');
  expect(result.edges[1].node.id).toBe('prod-B');
});
```

### E2E Tests (Playwright)

**Scenario**: Full pin workflow

```typescript
test('should pin, reorder, and unpin products', async ({ page }) => {
  await page.goto('/suppliers/sup-123');
  
  // Pin 3 products
  await page.locator('[data-product-id="prod-A"] button[aria-label="Pin product"]').click();
  await page.locator('[data-product-id="prod-B"] button[aria-label="Pin product"]').click();
  await page.locator('[data-product-id="prod-C"] button[aria-label="Pin product"]').click();
  
  // Verify pinned rail
  const pinnedRail = page.locator('[data-testid="pinned-rail"]');
  await expect(pinnedRail.locator('.pin-item')).toHaveCount(3);
  
  // Drag-drop reorder (prod-C to first position)
  await page.dragAndDrop(
    '[data-product-id="prod-C"]',
    '[data-product-id="prod-A"]'
  );
  
  // Refresh and verify order persisted
  await page.reload();
  const firstPin = pinnedRail.locator('.pin-item').first();
  await expect(firstPin).toContainText('prod-C');
  
  // Unpin
  await firstPin.locator('button[aria-label="Remove pin"]').click();
  await expect(pinnedRail.locator('.pin-item')).toHaveCount(2);
});
```

## Deployment

### Migration

```bash
cd services/restaurants
pnpm prisma migrate dev --name add_pinned_products
pnpm prisma migrate deploy # Production
```

### Seed Demo Data

```bash
pnpm ts-node prisma/seed-pins.ts
```

**Creates**:
- 4 pinned products for demo restaurant
- Supplier: `sup-sysco-001`
- Products: Chicken breast, Olive oil, Flour, Tomato sauce
- Notes on first 2 pins

### Environment Variables

```env
# Redis (required for caching)
REDIS_HOST=localhost
REDIS_PORT=6379

# RabbitMQ (required for events)
RABBITMQ_URL=amqp://guest:guest@localhost:5672
```

## Analytics Integration

### Events Published

```typescript
// pins.pinned
{
  restaurantId: string;
  supplierId: string;
  productId: string;
  timestamp: Date;
}

// pins.unpinned
{
  restaurantId: string;
  supplierId: string;
  productId: string;
  timestamp: Date;
}

// pins.reordered
{
  restaurantId: string;
  supplierId: string;
  productIdsInOrder: string[];
  timestamp: Date;
}
```

### Metrics to Track

1. **Pin Adoption**: % of restaurants using pins
2. **Pin Rate**: Avg pins per supplier
3. **Pin Churn**: Pins added vs removed per week
4. **Conversion Uplift**: Add-to-cart rate for pinned vs non-pinned
5. **Time-to-Add**: Average time to add pinned vs non-pinned products
6. **Search Behavior**: % searches that interact with pinned results

## Internationalization (i18n)

### Strings to Translate

```json
{
  "pins.toggle.pin": "Pin to top",
  "pins.toggle.unpin": "Unpin from top",
  "pins.toggle.tooltip": "Pin to top for quick access",
  "pins.rail.title": "Pinned Products",
  "pins.rail.empty.title": "Pin Your Staples",
  "pins.rail.empty.description": "Quick access your most-ordered items — pin products you buy often to keep them at the top.",
  "pins.rail.empty.cta": "Click the ★ icon on any product to pin it",
  "pins.rail.dragToReorder": "Drag to reorder",
  "pins.search.pinnedMatches": "Pinned Matches",
  "pins.note.placeholder": "Add a note or alias..."
}
```

### RTL Support

- Pinned rail: Reverses horizontal scroll direction
- Star icon: Mirrored for RTL
- Drag handles: Right-to-left drag behavior
- Text alignment: `text-align: start` (auto-adjusts)

## Troubleshooting

### Pins not appearing

1. **Check cache**: `redis-cli GET pins:v1:${restaurantId}:${supplierId}`
2. **Verify DB**: `SELECT * FROM pinned_products WHERE restaurant_id = '...'`
3. **Check logs**: GraphQL resolver should log "Fetching pins for..."

### Reorder not persisting

1. **Transaction failed**: Check PostgreSQL logs
2. **Cache not invalidated**: Verify Redis `DEL` command executed
3. **Race condition**: Ensure 300ms throttle applied (check network tab)

### Performance issues

1. **Too many pins**: Limit enforced at 200, but consider UI pagination
2. **Cache misses**: Check Redis connection, TTL settings
3. **Slow queries**: Run `EXPLAIN` on pins query, verify indexes

## Future Enhancements

- [ ] **Shared Pins**: Allow sharing pins across restaurants in same org
- [ ] **Auto-Pin**: ML-based auto-pinning of frequently ordered items
- [ ] **Pin Categories**: Group pins by category (produce, proteins, etc.)
- [ ] **Pin Notes with Voice**: Voice-to-text for quick note entry
- [ ] **Pin Expiry**: Auto-unpin if not ordered in N days
- [ ] **Bulk Pin**: Pin all items from a previous order
- [ ] **Pin Insights**: Dashboard showing most-pinned products across customers

---

**Version**: 1.0.0  
**Last Updated**: 2025-01-21  
**Maintainer**: Supplify Platform Team

