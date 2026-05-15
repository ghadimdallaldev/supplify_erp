# Supplify ERP — Session Work Summary

## Overview

Two-session sprint focused on making the app production-ready across security, features, API wiring, and UI correctness.

---

## 1. Socket.IO Authentication (Security Fix)

**File:** `apps/api/src/lib/socket.js`

**Problem:** Socket.IO had no authentication — any unauthenticated client could connect, join rooms, and send/receive messages.

**Fix:** Added an `io.use(...)` middleware that:
- Reads the `access_token` HTTP-only cookie from the socket handshake headers
- Verifies it with `verifyToken` (Keycloak JWT)
- Looks up the user in `app_user` via `keycloak_sub`
- Attaches `socket.data.userId` and `socket.data.role`
- Rejects connection with `Unauthorized` if any step fails

Also fixed the `send_message` handler to use `socket.data.userId` (server-authoritative) instead of the client-provided `senderId`.

**Cookie parsing:** Used manual `indexOf('=')` parsing instead of the `cookie` package (only a transitive dep) to correctly handle JWT tokens that contain `=` characters.

---

## 2. Reservations — Duplicate branchId Bug Fix

**File:** `apps/api/src/routes/reservations.routes.js`

**Problem:** In `fetchReservations`, `branchId` was pushed into `params` on line 112, then the ternary on line 125 pushed it again — causing a duplicate parameter in the SQL query.

**Fix:** Changed line 125 from `branchId ? [...params, branchId] : params` to just `params`.

---

## 3. Inventory Adjustment — API Wiring

**Files modified:**
- `apps/web/src/services/api.ts`
- `apps/web/src/pages/InventoryPage.tsx`
- `apps/web/src/pages/ProductsPage.tsx`

### api.ts
Added two new RTK Query mutations:
- `createWarehouse` — POST `/api/warehouses`
- `createInventoryAdjustment` — POST `/api/inventory/product/:productId/adjustment`

Both exported as `useCreateWarehouseMutation` and `useCreateInventoryAdjustmentMutation`.

### InventoryPage.tsx
- Converted `adjustmentForm` from plain object to React state
- Added `useCreateInventoryAdjustmentMutation` hook
- Added `ADJUSTMENT_TYPES` constant for the select dropdown
- Rewrote `handleAdjustment` to call the real API and reset form on success
- Made all dialog inputs controlled (select, Input, Textarea)
- Removed unused imports: `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`, `TrendingDown`

### ProductsPage.tsx
- Added `useCreateInventoryAdjustmentMutation` hook
- Replaced fake toast onClick with async call to `createInventoryAdjustment`
- Maps UI value `'ADD'` → `'IN'` and `'REMOVE'` → `'OUT'` to match API enum

---

## 4. Warehouse Creation — API Wiring

**File:** `apps/web/src/pages/SupplierSettingsPage.tsx`

- Added `useGetWarehousesQuery` and `useCreateWarehouseMutation` imports
- Rewrote `handleAddWarehouse` from a fake toast to a real async API call with validation
- Fixed the warehouse tab to render `warehousesData?.warehouses` dynamically instead of a hardcoded placeholder
- Added `Loader2` spinner and `disabled={isCreatingWarehouse}` on the submit button

---

## 5. Chat Debug Cleanup

**File:** `apps/web/src/pages/ChatPage.tsx`

- Removed all `console.log` calls from socket event handlers (`connect`, `disconnect`, `new_message`, `message_read_update`, `messages_read_update`)
- Removed the entire debug `useEffect` block
- Changed handler params from named `data` to `_data` where unused

---

## 6. Production Readiness Audits (No Code Changes Needed)

The following were audited and confirmed already correct:

| Feature | File | Status |
|---|---|---|
| Branch subscription auto-assignment | `apps/api/src/routes/linked-accounts.js:114` | `assignFreeSubscription` already called atomically inside transaction |
| Order limit check position | `apps/api/src/routes/orders.routes.js:928` | `checkAndIncrementUsage` fires before the INSERT at line 966 |
| Chat daily limit | `apps/api/src/routes/chat.routes.js:558–602` | Already enforced with `checkAndIncrementUsage('chats_per_day')` |
| File upload size limit | `apps/api/src/routes/files.routes.js:59` | Already capped at 10MB |

---

## 7. Floor Builder — Read & Planned (Not Yet Implemented)

**File:** `apps/web/src/components/reservations/ReservationTableBuilder.tsx`

Read the full 752-line component. Confirmed types from `apps/web/src/types/index.ts`:
- `ReservationTableShape = 'round' | 'square' | 'rectangle' | 'booth' | 'chef_table'`
- `ReservationTableZone = 'main' | 'patio' | 'bar' | 'vip' | 'private'`

### Current state
- `react-rnd` for drag/resize
- Inactive tables filtered out entirely from canvas (line 499)
- No chair visual indicators
- No grid snapping
- No undo history
- No zoom
- No keyboard shortcuts
- Shape differentiation via CSS `border-radius` only (no SVG)
- Fixed 560px canvas height

### Planned enhancements (not yet applied — session ended before implementation)
1. **Chair indicators** — small circles around table perimeter based on capacity
2. **Inactive tables shown dimmed** — opacity ~30%, pointer-events none, visible but unselectable
3. **Keyboard shortcuts** — Delete/Backspace = delete selected, Escape = deselect, Ctrl+D = duplicate, Ctrl+Z = undo
4. **Grid snapping toggle** — snap positions to 40px grid
5. **Undo history** — last 20 states
6. **Zoom controls** — +/−/reset buttons
7. **Visual polish improvements**

---

## Key Architecture Notes

- **Multi-tenant:** Each branch = separate tenant account via `tenant_account_link` table
- **Plan enforcement:** `checkAndIncrementUsage`, `requireFeature`, `buildLimitExceededPayload`
- **Feature flags:** 3-level resolution — tenant override → global override → plan → default
- **Impersonation:** JWT-based signed cookie (`impersonation_token`)
- **Auth:** Keycloak JWT in HTTP-only `access_token` cookie, verified via `verifyToken`
- **Frontend stack:** React + TypeScript, RTK Query, react-rnd, CSS custom properties design tokens

---

## Next Steps

- Implement the floor builder enhancements listed in section 7
- Test the full reservations flow end-to-end after the floor builder update
